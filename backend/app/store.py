"""JSON-file store for uploaded PDFs: each assignment's uploads and their matching, keyed by its slug.

Courses and assignments themselves live in the database (see app.assignments).
"""

import json
import threading

from app import config

DATA_DIR = config.DATA_DIR
DB_PATH = DATA_DIR / "db.json"
UPLOAD_DIR = DATA_DIR / "uploads"
SUBMISSION_DIR = DATA_DIR / "submissions"

_lock = threading.Lock()


def entry(db: dict, assignment_id: str) -> dict:
    """The uploads kept for this assignment, added to `db` empty if it has none yet."""
    for assignment in db["assignments"]:
        if assignment["id"] == assignment_id:
            return assignment
    assignment = {"id": assignment_id, "uploads": []}
    db["assignments"].append(assignment)
    return assignment


def _read() -> dict:
    db = json.loads(DB_PATH.read_text()) if DB_PATH.exists() else {}
    db.setdefault("assignments", [])
    return db


def load() -> dict:
    with _lock:
        db = _read()
        if not DB_PATH.exists():
            _write(db)
        return db


def _write(db: dict) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = DB_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(db, indent=2))
    tmp.replace(DB_PATH)


def update(mutate) -> dict:
    """Load, apply `mutate(db)`, save atomically, and return the result of mutate."""
    with _lock:
        db = _read()
        result = mutate(db)
        _write(db)
        return result
