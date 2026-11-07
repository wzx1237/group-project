"""The course's student and staff rosters. They live in the database; app.seed loads them from the CSVs in config.json."""

import csv

from psycopg_pool import ConnectionPool

from app import config, store
from app.database import roster as roster_db


def _read(key: str) -> list[dict]:
    path = store.DATA_DIR / config.load()["rosters"][key]
    if not path.exists():
        raise FileNotFoundError(f"Roster file not found: {path}")
    with path.open(newline="", encoding="utf-8-sig") as f:
        return [{k.strip(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def students_csv() -> list[dict]:
    return [
        {
            "uid": r["uid"],
            "name": r.get("name") or r.get("student_name") or "",
            "directory_id": r.get("directory_id"),
            "email": r.get("email"),
            "section": r.get("section"),
        }
        for r in _read("students")
    ]


def staff_csv() -> list[dict]:
    return [
        {"name": r["name"], "directory_id": r["directory_id"], "role": r["role"], "email": r["email"]}
        for r in _read("staff")
    ]


def students(pool: ConnectionPool, course_id: int | None = None) -> list[dict]:
    """Read the course roster; persistence owns the SQL and current row shape."""
    course = config.load()["course"]
    with pool.connection() as conn:
        return roster_db.students(conn, course_id=course_id, code=course["code"], term=course["term"])


def staff(pool: ConnectionPool, course_id: int | None = None) -> list[dict]:
    """Read the course roster; persistence owns the SQL and current row shape."""
    course = config.load()["course"]
    with pool.connection() as conn:
        return roster_db.staff(conn, course_id=course_id, code=course["code"], term=course["term"])
