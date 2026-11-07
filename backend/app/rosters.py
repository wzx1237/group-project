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
    course = config.load()["course"]
    with pool.connection() as conn:
        has_section = True
        try:
            conn.execute("SAVEPOINT check_sec")
            conn.execute("SELECT section FROM enrollment LIMIT 0")
            conn.execute("RELEASE SAVEPOINT check_sec")
        except Exception:
            conn.execute("ROLLBACK TO SAVEPOINT check_sec")
            has_section = False

        sec_col = ", en.section" if has_section else ""

        has_status = True
        try:
            conn.execute("SAVEPOINT check_status")
            conn.execute("SELECT status FROM enrollment LIMIT 0")
            conn.execute("RELEASE SAVEPOINT check_status")
        except Exception:
            conn.execute("ROLLBACK TO SAVEPOINT check_status")
            has_status = False

        stat_col = ", en.status" if has_status else ""

        if course_id is not None:
            return conn.execute(
                f"""SELECT s.uid, s.name, s.directory_id, s.email{sec_col}{stat_col}
                   FROM student s JOIN enrollment en USING (uid)
                   WHERE en.course_id = %s
                   ORDER BY s.name""",
                (course_id,),
            ).fetchall()

        return conn.execute(
            f"""SELECT s.uid, s.name, s.directory_id, s.email{sec_col}{stat_col}
               FROM student s JOIN enrollment en USING (uid) JOIN course c USING (course_id)
               WHERE c.code = %s AND c.term = %s
               ORDER BY s.name""",
            (course["code"], course["term"]),
        ).fetchall()


def staff(pool: ConnectionPool, course_id: int | None = None) -> list[dict]:
    course = config.load()["course"]
    with pool.connection() as conn:
        if course_id is not None:
            return conn.execute(
                """SELECT s.directory_id, s.name, s.email, s.role
                   FROM staff s JOIN course_staff cs USING (directory_id)
                   WHERE cs.course_id = %s
                   ORDER BY s.role, s.name""",
                (course_id,),
            ).fetchall()
        return conn.execute(
            """SELECT s.directory_id, s.name, s.email, s.role
               FROM staff s JOIN course_staff USING (directory_id) JOIN course c USING (course_id)
               WHERE c.code = %s AND c.term = %s
               ORDER BY s.role, s.name""",
            (course["code"], course["term"]),
        ).fetchall()
