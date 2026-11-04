"""JSON-file "database": one course with its assignments and their uploaded PDFs."""

import json
import threading

from app import config

DATA_DIR = config.DATA_DIR
DB_PATH = DATA_DIR / "db.json"
UPLOAD_DIR = DATA_DIR / "uploads"
SUBMISSION_DIR = DATA_DIR / "submissions"

_lock = threading.Lock()


def _sync(db: dict) -> dict:
    """Bring the course and assignment list in line with config.json, keeping uploads and statuses.

    Assignments dropped from the config disappear unless they already hold uploads or statuses.
    """
    cfg = config.load()
    existing = {a["id"]: a for a in db.get("assignments", [])}
    assignments = []
    for row in cfg["assignments"]:
        assignment = existing.pop(row["id"], {"uploads": [], "statuses": {}})
        assignment.update({field: row[field] for field in config.ASSIGNMENT_FIELDS})
        assignments.append(assignment)
    assignments += [a for a in existing.values() if a["uploads"] or a["statuses"]]
    db["course"], db["assignments"] = cfg["course"], assignments
    return db


def load() -> dict:
    with _lock:
        db = _sync(json.loads(DB_PATH.read_text()) if DB_PATH.exists() else {})
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
        db = _sync(json.loads(DB_PATH.read_text()) if DB_PATH.exists() else {})
        result = mutate(db)
        _write(db)
        return result
