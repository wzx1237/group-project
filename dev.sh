#!/usr/bin/env bash
# Start GradeFlow locally: PostgreSQL, the backend and the frontend, with one command.
#
#   ./dev.sh             set up anything missing, load the seed data, then run everything
#   ./dev.sh --no-seed   same, but skip `python -m app.seed`
#
# Press Ctrl+C to stop the backend and frontend. PostgreSQL keeps running in Docker;
# stop it with `docker compose down`.
#
# One thing this script cannot do for you: the /etc/hosts entry for gradeflow.test (needs sudo).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SEED=1
for arg in "$@"; do
  case "$arg" in
    --no-seed) SEED=0 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Prefix every line of a command's output so the two servers can share one terminal.
prefix() { awk -v p="[$1] " '{ print p $0; fflush() }'; }

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# ---- Checks --------------------------------------------------------------

step "Checking requirements"
command -v docker  >/dev/null || die "Docker is not installed. Install Docker Desktop first."
docker info >/dev/null 2>&1   || die "Docker is not running. Start Docker Desktop and try again."
command -v python3 >/dev/null || die "python3 is not installed."
command -v npm     >/dev/null || die "npm is not installed (Node 20+ is required)."

if ! grep -Eq '^[^#]*[[:space:]]gradeflow\.test([[:space:]]|$)' /etc/hosts; then
  die "gradeflow.test is not in /etc/hosts. UMD CAS rejects localhost, so run this once:
  echo \"127.0.0.1 gradeflow.test\" | sudo tee -a /etc/hosts"
fi

for port in 8000 3000; do
  if port_in_use "$port"; then
    die "Port $port is already in use. Stop whatever is running there (an earlier dev server?) and try again."
  fi
done

# ---- backend/.env --------------------------------------------------------

if [ ! -f backend/.env ]; then
  step "Creating backend/.env from .env.example"
  cp backend/.env.example backend/.env
fi
if grep -Eq '^SESSION_SECRET=[[:space:]]*$' backend/.env; then
  step "Generating a SESSION_SECRET in backend/.env"
  secret="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
  python3 - "$secret" <<'PY'
import re, sys
path = "backend/.env"
text = open(path).read()
text = re.sub(r"^SESSION_SECRET=.*$", "SESSION_SECRET=" + sys.argv[1], text, flags=re.M)
open(path, "w").write(text)
PY
fi

# ---- Database ------------------------------------------------------------

step "Starting PostgreSQL"
docker compose up -d db

printf 'Waiting for PostgreSQL'
for _ in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U gradeflow -d gradeflow >/dev/null 2>&1; then
    printf ' ready\n'
    break
  fi
  printf '.'
  sleep 1
done
docker compose exec -T db pg_isready -U gradeflow -d gradeflow >/dev/null 2>&1 \
  || die "PostgreSQL did not become ready within 60 seconds. Check: docker compose logs db"

# ---- Backend dependencies ------------------------------------------------

if [ ! -d backend/.venv ]; then
  step "Creating the Python virtual environment"
  python3 -m venv backend/.venv
fi
STAMP=backend/.venv/.requirements-installed
if [ ! -f "$STAMP" ] || [ backend/requirements.txt -nt "$STAMP" ]; then
  step "Installing Python dependencies"
  backend/.venv/bin/pip install -r backend/requirements.txt
  touch "$STAMP"
fi

# ---- Frontend dependencies -----------------------------------------------

# `npm ci` installs exactly what package-lock.json says and never rewrites it.
if [ ! -d frontend/node_modules ] || [ frontend/package-lock.json -nt frontend/node_modules/.package-lock.json ]; then
  step "Installing frontend dependencies"
  (cd frontend && npm ci)
fi

# ---- Seed data -----------------------------------------------------------

if [ "$SEED" -eq 1 ]; then
  step "Loading the course, staff and students (safe to run again)"
  (cd backend && .venv/bin/python -m app.seed)
fi

# ---- Run -----------------------------------------------------------------

cleanup() {
  trap - EXIT INT TERM
  printf '\nStopping backend and frontend...\n'
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

step "Starting the backend (port 8000) and frontend (port 3000)"

(cd backend && exec .venv/bin/uvicorn app.main:create_app --factory --reload) > >(prefix backend) 2>&1 &
BACKEND_PID=$!
(cd frontend && exec npm run dev) > >(prefix frontend) 2>&1 &
FRONTEND_PID=$!

announce_ready() {
  printf '\n=====================================================\n'
  printf '  Setup done. Backend (8000) and frontend (3000) are up.\n'
  printf '  Open http://gradeflow.test:3000 (not localhost).\n'
  printf '  Press Ctrl+C to stop.\n'
  printf '=====================================================\n\n'
}

# Announce once both ports are listening, and stop everything if either server exits.
announced=0
waited=0
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  if [ "$announced" -eq 0 ]; then
    if port_in_use 8000 && port_in_use 3000; then
      announce_ready
      announced=1
    elif [ "$waited" -ge 90 ]; then
      printf '\nThe servers have not opened their ports after 90 seconds; check the logs above.\n'
      announced=1
    fi
    waited=$((waited + 1))
  fi
  sleep 1
done
printf '\nA server exited; shutting down.\n'
