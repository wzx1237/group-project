"""Helper for install.sh: reads and writes backend/.env. Standard library only.

  python scripts/install_env.py env [--set KEY=VALUE ...]
      Create backend/.env from .env.example if it is missing, fill in a blank SESSION_SECRET,
      and set the given keys. Safe to run again.

  python scripts/install_env.py get KEY
      Print KEY's value from backend/.env (empty if missing).
"""

import argparse
import re
import secrets
import shutil
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
ENV = BACKEND / ".env"
EXAMPLE = BACKEND / ".env.example"


def get_key(text: str, key: str) -> str:
    match = re.search(rf"^{re.escape(key)}=(.*)$", text, flags=re.M)
    return match.group(1).strip() if match else ""


def set_key(text: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    pattern = rf"^{re.escape(key)}=.*$"
    if re.search(pattern, text, flags=re.M):
        return re.sub(pattern, lambda _: line, text, flags=re.M)
    return text.rstrip("\n") + "\n" + line + "\n"


def ensure_env(pairs: list[str]) -> None:
    if not ENV.exists():
        shutil.copyfile(EXAMPLE, ENV)
        print("    Created backend/.env from .env.example")
    text = ENV.read_text()
    if not get_key(text, "SESSION_SECRET"):
        text = set_key(text, "SESSION_SECRET", secrets.token_urlsafe(32))
        print("    Generated SESSION_SECRET")
    for pair in pairs:
        key, _, value = pair.partition("=")
        if get_key(text, key) != value:
            text = set_key(text, key, value)
            print(f"    Set {key}")
    ENV.write_text(text)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    env = sub.add_parser("env")
    env.add_argument("--set", action="append", default=[], metavar="KEY=VALUE")
    get = sub.add_parser("get")
    get.add_argument("key")
    args = parser.parse_args()
    if args.command == "env":
        ensure_env(args.set)
    else:
        print(get_key(ENV.read_text(), args.key) if ENV.exists() else "")


if __name__ == "__main__":
    main()
