"""Load the course in data/config.json and its staff and student rosters into the database. Safe to run again.

Run from backend/:  python -m app.seed
"""

import psycopg

from app import config, db, rosters
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
        for person in staff:
            directory_id = person["directory_id"].lower()
            conn.execute(
                """INSERT INTO staff (directory_id, name, email) VALUES (%s, %s, %s)
                   ON CONFLICT (directory_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email""",
                (directory_id, person["name"], person["email"] or None),
            )
            conn.execute(
                "INSERT INTO course_staff (course_id, directory_id, role) VALUES (%s, %s, %s) ON CONFLICT (course_id, directory_id) DO UPDATE SET role = EXCLUDED.role",
                (course_id, directory_id, person["role"].lower()),
            )
        for student in students:
            conn.execute(
                """INSERT INTO student (uid, name) VALUES (%s, %s)
                   ON CONFLICT (uid) DO UPDATE SET name = EXCLUDED.name""",
                (int(student["uid"]), student["name"]),
            )
            conn.execute(
                "INSERT INTO enrollment (course_id, uid) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (course_id, student["uid"]),
            )
    print(f"Loaded {course['code']} {course['term']} with {len(staff)} staff and {len(students)} students")


if __name__ == "__main__":
    seed(Settings().database_url)
