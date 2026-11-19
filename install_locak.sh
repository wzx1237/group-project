#!/usr/bin/env bash
#
#   sudo ./install_local.sh --domain gradeflow.example.edu --instructor jdoe --instructor-name "Jane Doe"
#
# Installs GradeFlow for LOCAL/HTTP deployment on a Linux server with systemd
# (any distro: apt, dnf, yum, zypper or pacman). No HTTPS, no Caddy.
# Safe to run again; after `sudo git pull`, run it again to deploy the update.
#
#   --domain NAME            public host name (required the first time); served over plain HTTP
#   --http-port PORT         port the frontend listens on publicly (default 80)
#   --instructor ID          UMD Directory ID of the first instructor, who can then sign in
#   --instructor-name NAME   that instructor's name (required with --instructor)
#   --instructor-email EMAIL (optional)
#   --db-name NAME           database name (default gradeflow)
#
# Clone the repo somewhere root owns (e.g. /opt/gradeflow). What it sets up:
#   - PostgreSQL from the distro, as its normal service; the app connects over the local socket
#   - the system's existing Python (3.10+) and a venv in backend/.venv
#   - Node 22 (from nodejs.org) inside .tools/, so distro versions don't matter
#   - a `gradeflow` system user, backend/.env, the venv, `npm ci` + `next build`, migrations
#   - systemd services: gradeflow-backend (127.0.0.1:8000), gradeflow-frontend (0.0.0.0:HTTP_PORT)
# Logs: journalctl -u gradeflow-backend -u gradeflow-frontend

set -euo pipefail
umask 022  # the gradeflow user must be able to read what root installs

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DOMAIN="" HTTP_PORT=80 DB_NAME=gradeflow
INSTRUCTOR="" INSTRUCTOR_NAME="" INSTRUCTOR_EMAIL=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --domain|--http-port|--instructor|--instructor-name|--instructor-email|--db-name)
      [ $# -ge 2 ] || { echo "$1 needs a value" >&2; exit 2; }
      case "$1" in
        --domain) DOMAIN="$2" ;;
        --http-port) HTTP_PORT="$2" ;;
        --instructor) INSTRUCTOR="$2" ;;
        --instructor-name) INSTRUCTOR_NAME="$2" ;;
        --instructor-email) INSTRUCTOR_EMAIL="$2" ;;
        --db-name) DB_NAME="$2" ;;
      esac
      shift ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

APP_USER=gradeflow
TOOLS="$ROOT/.tools"
NODE_MAJOR=22
NODE_MIN=20.9.0
PG_MIN=130000      # gen_random_uuid() in the migrations needs PostgreSQL 13+
BACKEND_PORT=8000
FRONTEND_PORT=3000
UNITS=/etc/systemd/system

step() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }  # is $1 >= $2?
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
as_app() { runuser -u "$APP_USER" -- "$@"; }
as_postgres() { (cd / && runuser -u postgres -- "$@"); }

# ---- Checks --------------------------------------------------------------

step "Checking the system"
[ "$(uname -s)" = Linux ] || die "This installer is for Linux servers."
[ "$(id -u)" -eq 0 ] || die "Run it with sudo: sudo ./install_local.sh ..."
[ -d /run/systemd/system ] || die "systemd is not running. GradeFlow's services need systemd."

case "$(uname -m)" in
  x86_64|amd64) ARCH_NODE=x64 ;;
  aarch64|arm64) ARCH_NODE=arm64 ;;
  *) die "Unsupported CPU architecture: $(uname -m)" ;;
esac

PKG=""
for pm in apt-get dnf yum zypper pacman; do if have "$pm"; then PKG="$pm"; break; fi; done
[ -n "$PKG" ] || die "No supported package manager (apt-get, dnf, yum, zypper, pacman) found."
note "Package manager: $PKG"

# Keep the domain from the last run if none is given.
if [ -z "$DOMAIN" ] && [ -f backend/.env ]; then
  DOMAIN="$(sed -n 's#^APP_BASE_URL=http://\([^/:]*\).*#\1#p' backend/.env | head -n1)"
fi
[ -n "$DOMAIN" ] || die "Give the public host name: --domain gradeflow.example.edu"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "--domain takes a bare host name like gradeflow.example.edu (no http:// or path)."
[[ "$HTTP_PORT" =~ ^[0-9]+$ ]] && [ "$HTTP_PORT" -ge 1 ] && [ "$HTTP_PORT" -le 65535 ] \
  || die "--http-port takes a TCP port number (1-65535)."
[ -z "$INSTRUCTOR" ] || [ -n "$INSTRUCTOR_NAME" ] || die "--instructor needs --instructor-name too."
[[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "--db-name may only use letters, digits and _."

APT_UPDATED=0
pkg_install() {
  note "Installing with $PKG: $*"
  case "$PKG" in
    apt-get)
      if [ "$APT_UPDATED" -eq 0 ]; then apt-get update -q; APT_UPDATED=1; fi
      DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends "$@" ;;
    dnf|yum) "$PKG" install -y -q "$@" ;;
    zypper) zypper --non-interactive install --no-recommends "$@" ;;
    pacman) pacman -Sy --needed --noconfirm "$@" ;;
  esac
}

need=()
have curl || need+=(curl)
have tar || need+=(tar)
have gzip || need+=(gzip)
have runuser || need+=(util-linux)
[ -e /etc/ssl/certs/ca-certificates.crt ] || [ -e /etc/pki/tls/certs/ca-bundle.crt ] || [ -e /etc/ssl/ca-bundle.pem ] || need+=(ca-certificates)
[ ${#need[@]} -eq 0 ] || pkg_install "${need[@]}"

fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
sha_check() {  # sha_check ALGO FILE EXPECTED
  [ "$("sha$1sum" "$2" | cut -d' ' -f1)" = "$3" ] || die "$(basename "$2") failed its checksum."
}

# ---- Service user --------------------------------------------------------

step "System user $APP_USER"
if id "$APP_USER" >/dev/null 2>&1; then
  note "Exists"
else
  useradd --system --user-group --home-dir "$ROOT" --no-create-home \
    --shell "$(command -v nologin || echo /bin/false)" "$APP_USER"
  note "Created"
fi
as_app test -r "$ROOT/backend/app/main.py" \
  || die "$APP_USER cannot read $ROOT. Clone the repo somewhere world-readable, such as /opt/gradeflow."

# ---- PostgreSQL ----------------------------------------------------------

step "PostgreSQL"
if ! have psql || ! id postgres >/dev/null 2>&1; then
  case "$PKG" in
    apt-get) pkg_install postgresql ;;
    dnf|yum)
      # RHEL 8's default stream is PostgreSQL 10; ask for a newer one where modules exist.
      if "$PKG" module list postgresql >/dev/null 2>&1; then
        "$PKG" -y -q module enable postgresql:16 2>/dev/null || "$PKG" -y -q module enable postgresql:15 2>/dev/null || true
      fi
      pkg_install postgresql-server postgresql ;;
    zypper) pkg_install postgresql-server postgresql ;;
    pacman) pkg_install postgresql ;;
  esac
fi

# Some distros leave creating the cluster to the admin.
case "$PKG" in
  dnf|yum)
    if [ ! -s /var/lib/pgsql/data/PG_VERSION ]; then note "Initializing the cluster"; postgresql-setup --initdb; fi ;;
  pacman)
    if [ ! -s /var/lib/postgres/data/PG_VERSION ]; then
      note "Initializing the cluster"
      as_postgres initdb -D /var/lib/postgres/data -E UTF8 --auth-local=peer --auth-host=scram-sha-256
    fi ;;
esac
systemctl enable --now postgresql >/dev/null 2>&1 || systemctl enable --now postgresql
for _ in $(seq 1 30); do as_postgres psql -XqtAc 'SELECT 1' >/dev/null 2>&1 && break; sleep 1; done
psql_super() { as_postgres psql -X -v ON_ERROR_STOP=1 -qtA -d postgres -c "$1"; }
psql_super 'SELECT 1' >/dev/null || die "Cannot connect to PostgreSQL as the postgres user. Check: systemctl status postgresql"

pg_num="$(psql_super 'SHOW server_version_num')"
[ "$pg_num" -ge "$PG_MIN" ] || die "PostgreSQL $(psql_super 'SHOW server_version') is too old; 13 or newer is needed."
PG_SOCKET="$(psql_super 'SHOW unix_socket_directories' | cut -d, -f1 | tr -d ' ')"
PG_PORT="$(psql_super 'SHOW port')"
note "PostgreSQL $(psql_super 'SHOW server_version'), socket $PG_SOCKET, port $PG_PORT"

# The role has no password: it signs in over the local socket as the matching OS user (peer auth).
if [ "$(psql_super "SELECT 1 FROM pg_roles WHERE rolname = '$APP_USER'")" = 1 ]; then
  note "Role $APP_USER exists"
else
  psql_super "CREATE ROLE \"$APP_USER\" LOGIN" >/dev/null
  note "Created role $APP_USER"
fi
if [ "$(psql_super "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" = 1 ]; then
  note "Database $DB_NAME exists"
else
  psql_super "CREATE DATABASE \"$DB_NAME\" OWNER \"$APP_USER\" ENCODING 'UTF8' TEMPLATE template0" >/dev/null
  note "Created database $DB_NAME"
fi

# ---- Python (system interpreter) -----------------------------------------

step "Python (system)"
VENV_PY="$ROOT/backend/.venv/bin/python"
# Recreate the venv if it is missing or was built from a different interpreter than the system one.
SYS_PY="$(command -v python3 || true)"
have python3 || die "python3 not found. Install it (e.g. apt-get install python3 python3-venv)."
SYS_PY_VER="$("$SYS_PY" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
note "System python3 is $SYS_PY_VER ($SYS_PY)"
if [ -x "$VENV_PY" ]; then
  venv_ver="$("$VENV_PY" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo none)"
  if [ "$venv_ver" != "$SYS_PY_VER" ]; then
    note "backend/.venv is Python $venv_ver; recreating it with system python3"
    rm -rf backend/.venv
  fi
fi
if [ ! -x "$VENV_PY" ]; then
  # Ensure venv module is available (Debian/Ubuntu ship it separately).
  if ! "$SYS_PY" -m venv --help >/dev/null 2>&1; then
    case "$PKG" in
      apt-get) pkg_install python3-venv ;;
      *) : ;;  # venv is bundled elsewhere
    esac
  fi
  "$SYS_PY" -m venv backend/.venv
fi
note "$("$VENV_PY" --version)"

STAMP=backend/.venv/.requirements-installed
if [ ! -f "$STAMP" ] || [ backend/requirements.txt -nt "$STAMP" ]; then
  "$VENV_PY" -m pip install --upgrade pip >/dev/null
  "$VENV_PY" -m pip install -r backend/requirements.txt
  touch "$STAMP"
else
  note "Backend dependencies up to date"
fi

# ---- Node ----------------------------------------------------------------

step "Node $NODE_MAJOR"
NODE="$TOOLS/node/bin/node"
if [ ! -x "$NODE" ] || ! version_ge "$("$NODE" -p 'process.versions.node')" "$NODE_MIN"; then
  dist="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  tmp="$(mktemp -d)"
  fetch "$dist/SHASUMS256.txt" "$tmp/SHASUMS256.txt"
  line="$(grep -E "  node-v[0-9.]+-linux-$ARCH_NODE\.tar\.gz$" "$tmp/SHASUMS256.txt" | head -n1)"
  [ -n "$line" ] || die "No Node $NODE_MAJOR build for linux-$ARCH_NODE."
  file="${line##* }"
  note "Downloading $file"
  fetch "$dist/$file" "$tmp/$file"
  sha_check 256 "$tmp/$file" "${line%% *}"
  rm -rf "$TOOLS/node"; mkdir -p "$TOOLS/node"
  tar -xzf "$tmp/$file" -C "$TOOLS/node" --strip-components 1
  rm -rf "$tmp"
fi
export PATH="$TOOLS/node/bin:$PATH"
note "node $("$NODE" --version)"

# ---- backend/.env --------------------------------------------------------

step "backend/.env"
"$VENV_PY" scripts/install_env.py env \
  --set "APP_BASE_URL=http://$DOMAIN" \
  --set "DATABASE_URL=postgresql://$APP_USER@/$DB_NAME?host=$PG_SOCKET&port=$PG_PORT"
chown "root:$APP_USER" backend/.env
chmod 640 backend/.env

# ---- Frontend build ------------------------------------------------------

step "Frontend build"
export NEXT_TELEMETRY_DISABLED=1
if [ ! -d frontend/node_modules ] || [ frontend/package-lock.json -nt frontend/node_modules/.package-lock.json ]; then
  (cd frontend && npm ci --no-audit --no-fund)
fi
(cd frontend && GRADEFLOW_API="http://127.0.0.1:$BACKEND_PORT" npm run build)

# The app writes uploads, submissions, templates and db.json under data/, and Next.js its cache under .next/.
chown -R "$APP_USER:$APP_USER" data frontend/.next

# ---- Migrations and first instructor -------------------------------------

step "Database migrations"
(cd backend && as_app "$VENV_PY" -c 'from app import db; from app.settings import Settings; ran = db.migrate(Settings().database_url); print("    Applied: " + (", ".join(ran) if ran else "nothing new"))')

if [ -n "$INSTRUCTOR" ]; then
  step "Instructor $INSTRUCTOR"
  args=("$INSTRUCTOR" "$INSTRUCTOR_NAME" instructor)
  [ -z "$INSTRUCTOR_EMAIL" ] || args+=(--email "$INSTRUCTOR_EMAIL")
  (cd backend && as_app "$VENV_PY" -m app.add_staff "${args[@]}" | sed 's/^/    /')
fi

# ---- systemd services ----------------------------------------------------

step "systemd services"

# Remove any Caddy unit/config left over from a previous HTTPS install.
if [ -f "$UNITS/gradeflow-caddy.service" ]; then
  systemctl disable --now gradeflow-caddy >/dev/null 2>&1 || true
  rm -f "$UNITS/gradeflow-caddy.service"
  note "Removed leftover gradeflow-caddy.service"
fi

cat > "$UNITS/gradeflow-backend.service" <<EOF
[Unit]
Description=GradeFlow backend (FastAPI)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$ROOT/backend
# One worker: uploads are processed in background threads of this process.
ExecStart=$ROOT/backend/.venv/bin/uvicorn app.main:create_app --factory --host 127.0.0.1 --port $BACKEND_PORT --proxy-headers
Restart=on-failure
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ReadWritePaths=$ROOT/data

[Install]
WantedBy=multi-user.target
EOF

cat > "$UNITS/gradeflow-frontend.service" <<EOF
[Unit]
Description=GradeFlow frontend (Next.js)
After=network.target gradeflow-backend.service

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$ROOT/frontend
Environment=NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# Listen publicly on $HTTP_PORT (plain HTTP, no Caddy in front).
ExecStart=$NODE $ROOT/frontend/node_modules/next/dist/bin/next start -H 0.0.0.0 -p $HTTP_PORT
Restart=on-failure
# Bind to a privileged port (e.g. 80) as the non-root app user.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ReadWritePaths=$ROOT/frontend/.next

[Install]
WantedBy=multi-user.target
EOF

# Only refuse to start on an occupied port if our own frontend service is not already running on it.
if ! systemctl is-active --quiet gradeflow-frontend; then
  port_open "$HTTP_PORT" && die "Port $HTTP_PORT is already in use (another web server?). Stop it, then run this again."
fi

systemctl daemon-reload
systemctl enable gradeflow-backend gradeflow-frontend >/dev/null 2>&1
systemctl restart gradeflow-backend gradeflow-frontend

# ---- Firewall ------------------------------------------------------------

if have firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then
  step "Firewall (firewalld): opening HTTP"
  firewall-cmd --quiet --permanent --add-port="$HTTP_PORT/tcp"
  firewall-cmd --quiet --reload
elif have ufw && ufw status 2>/dev/null | grep -q '^Status: active'; then
  step "Firewall (ufw): opening HTTP"
  ufw allow "$HTTP_PORT/tcp" >/dev/null
fi

# ---- Check ---------------------------------------------------------------

step "Waiting for the services"
ok=1
for svc_port in "gradeflow-backend:$BACKEND_PORT" "gradeflow-frontend:$HTTP_PORT"; do
  svc="${svc_port%%:*}" port="${svc_port##*:}"
  for _ in $(seq 1 60); do port_open "$port" && break; sleep 1; done
  if port_open "$port"; then note "$svc is up"; else note "$svc is NOT listening; see: journalctl -u $svc"; ok=0; fi
done
[ "$ok" -eq 1 ] || die "Some services did not start."

printf '\nInstalled. Open http://%s\n' "$DOMAIN"
printf 'DNS for %s (or your /etc/hosts file) must point at this server.\n' "$DOMAIN"
printf 'UMD CAS must accept http://%s/api/auth/callback as a service URL.\n' "$DOMAIN"
[ -n "$INSTRUCTOR" ] || printf 'No instructor was added; rerun with --instructor ID --instructor-name NAME so someone can sign in.\n'