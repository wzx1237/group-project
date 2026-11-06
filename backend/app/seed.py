"""Load the course in data/config.json, its assignments, and its staff and student rosters into the database. Safe to run again.

Assignments are only inserted when their slug is new for the course; existing rows are never overwritten.

Run from backend/:  python -m app.seed
"""

import re

import psycopg

from app import config, db, rosters
from app.slugs import SLUG_PATTERN
from app.settings import Settings


def seed(url: str) -> None:
    db.migrate(url)
    course = config.load()["course"]
    staff = rosters.staff_csv()
    students = rosters.students_csv()
    with psycopg.connect(url) as conn:
        conn.execute(
            "INSERT INTO course (code, term) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (course["code"], course["term"]),
        )
        [course_id] = conn.execute(
            "SELECT course_id FROM course WHERE code = %s AND term = %s", (course["code"], course["term"])
        ).fetchone()
        assignments = config.load()["assignments"]
        for row in assignments:
            if not re.fullmatch(SLUG_PATTERN, row["id"]):
                raise ValueError(f"Assignment id {row['id']!r} in config.json must start with a letter and use only a-z, 0-9 and -")
        added = 0
        for row in assignments:
            added += conn.execute(
                """INSERT INTO assignment (course_id, exam_name, due, slug, kind, short) VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (course_id, slug) DO NOTHING""",
                (course_id, row["title"], row["due"], row["id"], row["kind"], row.get("short")),
            ).rowcount
        for person in staff:
            directory_id = person["directory_id"].lower()
            conn.execute(
                """INSERT INTO staff (directory_id, name, email, role) VALUES (%s, %s, %s, %s)
                   ON CONFLICT (directory_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role""",
                (directory_id, person["name"], person["email"] or None, person["role"].lower()),
            )
            conn.execute(
                "INSERT INTO course_staff (course_id, directory_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (course_id, directory_id),
            )
        for student in students:
            conn.execute(
                """INSERT INTO student (uid, name, directory_id) VALUES (%s, %s, %s)
                   ON CONFLICT (uid) DO UPDATE SET name = EXCLUDED.name, directory_id = EXCLUDED.directory_id""",
                (student["uid"], student["name"], student["directory_id"].lower() or None),
            )
            conn.execute(
                "INSERT INTO enrollment (course_id, uid) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (course_id, student["uid"]),
            )
    print(f"Loaded {course['code']} {course['term']} with {len(staff)} staff, {len(students)} students, {added} new assignments")


if __name__ == "__main__":
    seed(Settings().database_url)
