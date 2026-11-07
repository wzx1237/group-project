"""Courses and their assignments. They live in the database; uploads and their matching stay in app.store."""


import psycopg
from fastapi import HTTPException

from app import workflow
from app.slugs import SLUG_PATTERN, slugify, unique_slug
from app.database import course as course_db
from app.database import exam as exam_db
from app.database import staff as staff_db

KINDS = ("exam", "final exam", "homework", "lab", "quiz", "essay", "other")

# API field -> assignment column, for the fields an edit may change.
EDITABLE = {"title": "exam_name", "kind": "kind", "due": "due", "short": "short"}


def _shape(row: dict) -> dict:
    """An assignment as the API returns it. `id` is the slug; a missing short label falls back to it."""
    return {
        "id": row["slug"],
        "exam_id": row["exam_id"],
        "course_id": row["course_id"],
        "title": row["exam_name"],
        "kind": row["kind"],
        "short": row["short"] or row["slug"],
        "due": row["due"].isoformat() if row["due"] else None,
        "released_at": row["released_at"].isoformat() if row.get("released_at") else None,
        "status": row["status"],
    }


def courses_for(conn, directory_id: str) -> list[dict]:
    # retrieves courses for a staff member with assignments
    courses = course_db.courses_for_staff(conn, directory_id)
    rows = exam_db.get_course_exams(conn, [c['course_id'] for c in courses])
    # Grading progress over enrolled students, from mapping (see workflow.progress).
    progress = workflow.progress(conn, [r["exam_id"] for r in rows])
    for course in courses:
        course["assignments"] = [{**_shape(r), "progress": progress[r["exam_id"]]}
                                 for r in rows if r["course_id"] == course["course_id"]]
    return courses


def user_courses(pool, directory_id: str) -> list[dict]:
    with pool.connection() as conn:
        return courses_for(conn, directory_id)


def find(pool, directory_id: str, slug: str) -> dict:
    """The assignment with this slug in the first of the user's courses that has one."""
    for course in user_courses(pool, directory_id):
        for assignment in course["assignments"]:
            if assignment["id"] == slug:
                return assignment
    raise HTTPException(404, "Assignment not found")


def is_member(conn, course_id: int, directory_id: str) -> bool:
    return staff_db.course_membership(conn, course_id, directory_id) is not None


def is_instructor(conn, directory_id: str) -> bool:
    row = staff_db.staff_role(conn, directory_id)
    return row is not None and row["role"] == "instructor"


def create(conn, course_id: int, *, title: str, kind: str, due, short: str | None, slug: str | None) -> dict:
    """Add an assignment. Without a slug, one is made from the title.

    Slugs are unique across all courses because they name upload folders and templates. When another course already
    has the title's slug, the course code goes first ("cmsc351-midterm-1"); a repeat within the course gets -2, -3, ...
    """
    rows = exam_db.assignment_slugs(conn)
    taken = {r["slug"] for r in rows}
    if slug is not None:
        if slug in taken:
            raise HTTPException(409, "An assignment with that ID already exists")
    else:
        other_courses = {r["slug"] for r in rows if r["course_id"] != course_id}
        course = course_db.course_code(conn, course_id)
        prefix = course["code"] if course and slugify(title) in other_courses else None
        slug = unique_slug(title, taken, prefix)
    try:
        row = exam_db.create_assignment(conn, course_id, title, due, slug, kind, short or None)
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "Another assignment just took that ID. Try again.")
    return _shape(row)


def delete(conn, exam_id: int) -> None:
    """Remove one assignment. Its rubric, papers and grades go with it through the foreign keys."""
    exam_db.delete_assignment(conn, exam_id)


def update(conn, exam_id: int, fields: dict) -> dict:
    """Change the given fields (see EDITABLE) of one assignment. Its slug never changes."""
    changes = {EDITABLE[name]: (value or None) if name == "short" else value for name, value in fields.items()}
    if changes:
        exam_db.update_assignment_columns(conn, exam_id, changes)
    row = exam_db.get_assignment(conn, exam_id)
    return _shape(row)
