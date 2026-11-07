"""Load the course in data/config.json, its assignments, and its staff and student rosters into the database. Safe to run again.

Assignments are only inserted when their slug is new for the course; existing rows are never overwritten.

Run from backend/:  python -m app.seed
"""


import re

import psycopg

from app import config, db, rosters
from app.slugs import SLUG_PATTERN
from app.settings import Settings
from app.database import course as course_db
from app.database import exam as exam_db
from app.database import staff as staff_db
from app.database import student as student_db


def seed(url: str) -> None:
    db.migrate(url)
    course = config.load()["course"]
    staff = rosters.staff_csv()
    students = rosters.students_csv()
    with psycopg.connect(url) as conn:
        course_db.ensure_course(conn, course['code'], course['term'])
        [course_id] = course_db.course_id_by_term(conn, course['code'], course['term'])
        assignments = config.load()["assignments"]
        for row in assignments:
            if not re.fullmatch(SLUG_PATTERN, row["id"]):
                raise ValueError(f"Assignment id {row['id']!r} in config.json must start with a letter and use only a-z, 0-9 and -")
        added = 0
        for row in assignments:
            added += exam_db.seed_assignment(conn, course_id, row['title'], row['due'], row['id'], row['kind'], row.get('short'))
        for person in staff:
            directory_id = person["directory_id"].lower()
            staff_db.upsert_staff(conn, directory_id, person['name'], person['email'] or None, person['role'].lower())
            staff_db.ensure_course_member(conn, course_id, directory_id)
        for student in students:
            student_db.seed_student(conn, student['uid'], student['name'], student['directory_id'].lower() or None)
            student_db.enroll_student(conn, course_id, student['uid'])
    print(f"Loaded {course['code']} {course['term']} with {len(staff)} staff, {len(students)} students, {added} new assignments")


if __name__ == "__main__":
    seed(Settings().database_url)
