"""Add a single staff member to the database.

Run from backend/:
  python -m app.add_staff bhuang10 "Brian Huang" ta --email bhuang10@umd.edu
"""

import argparse

import psycopg

from app import config
from app.settings import Settings
from app.database import course as course_db
from app.database import staff as staff_db


def add_staff(url: str, directory_id: str, name: str, role: str, email: str | None) -> None:
    directory_id = directory_id.lower()
    role = role.lower()
    course = config.load()["course"]
    with psycopg.connect(url) as conn:
        staff_db.upsert_staff(conn, directory_id, name, email, role)
        course_db.ensure_course(conn, course['code'], course['term'])
        [course_id] = course_db.course_id_by_term(conn, course['code'], course['term'])
        staff_db.ensure_course_member(conn, course_id, directory_id)
    print(f"Added {directory_id} ({role}) to {course['code']} {course['term']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory_id")
    parser.add_argument("name")
    parser.add_argument("role", choices=["instructor", "ta"])
    parser.add_argument("--email")
    args = parser.parse_args()
    add_staff(Settings().database_url, args.directory_id, args.name, args.role, args.email)
