"""The course's student and staff rosters. They live in the database; app.seed loads them from the CSVs in config.json."""

import csv

from psycopg_pool import ConnectionPool

from app import config, store


def _read(key: str) -> list[dict]:
    path = store.DATA_DIR / config.load()["rosters"][key]
    if not path.exists():
        raise FileNotFoundError(f"Roster file not found: {path}")
    with path.open(newline="", encoding="utf-8-sig") as f:
        return [{k.strip(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def students_csv() -> list[dict]:
    return [
        {"uid": r["uid"], "name": r["student_name"], "directory_id": r["directory_id"]}
        for r in _read("students")
    ]


def staff_csv() -> list[dict]:
    return [
        {"name": r["name"], "directory_id": r["directory_id"], "role": r["role"], "email": r["email"]}
        for r in _read("staff")
    ]


def students(pool: ConnectionPool) -> list[dict]:
    course = config.load()["course"]
    with pool.connection() as conn:
        return conn.execute(
            """SELECT s.uid, s.name, s.directory_id, s.email
               FROM student s JOIN enrollment USING (uid) JOIN course c USING (course_id)
               WHERE c.code = %s AND c.term = %s
               ORDER BY s.name""",
            (course["code"], course["term"]),
        ).fetchall()


def staff(pool: ConnectionPool) -> list[dict]:
    course = config.load()["course"]
    with pool.connection() as conn:
        return conn.execute(
            """SELECT s.directory_id, s.name, s.email, s.role
               FROM staff s JOIN course_staff USING (directory_id) JOIN course c USING (course_id)
               WHERE c.code = %s AND c.term = %s
               ORDER BY s.role, s.name""",
            (course["code"], course["term"]),
        ).fetchall()
