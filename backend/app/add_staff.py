"""Add a single staff member to the database.

Run from backend/:
  python -m app.add_staff bhuang10 "Brian Huang" ta --email bhuang10@umd.edu
"""

import argparse

import psycopg

from app import config
from app.settings import Settings


def add_staff(url: str, directory_id: str, name: str, role: str, email: str | None) -> None:
    directory_id = directory_id.lower()
    role = role.lower()
    course = config.load()["course"]
    with psycopg.connect(url) as conn:
        conn.execute(
            """INSERT INTO staff (directory_id, name, email) VALUES (%s, %s, %s)
               ON CONFLICT (directory_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email""",
            (directory_id, name, email),
        )
        conn.execute(
            "INSERT INTO course (code, term) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (course["code"], course["term"]),
        )
        [course_id] = conn.execute(
            "SELECT course_id FROM course WHERE code = %s AND term = %s", (course["code"], course["term"])
        ).fetchone()
        conn.execute(
            "INSERT INTO course_staff (course_id, directory_id, role) VALUES (%s, %s, %s) ON CONFLICT (course_id, directory_id) DO UPDATE SET role = EXCLUDED.role",
            (course_id, directory_id, role),
        )
    print(f"Added {directory_id} ({role}) to {course['code']} {course['term']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory_id")
    parser.add_argument("name")
    parser.add_argument("role", choices=["instructor", "ta"])
    parser.add_argument("--email")
    args = parser.parse_args()
    add_staff(Settings().database_url, args.directory_id, args.name, args.role, args.email)
