"""Courses and their assignments. They live in the database; uploads and their matching stay in app.store."""

import psycopg
from fastapi import HTTPException

from app import workflow
from app.slugs import SLUG_PATTERN, slugify, unique_slug

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
    courses = conn.execute(
        """SELECT c.*, s.role,
                  (SELECT i.name FROM course_staff ic JOIN staff i USING (directory_id)
                    WHERE ic.course_id = c.course_id AND i.role = 'instructor'
                    ORDER BY (CASE WHEN i.name LIKE '%%Herman%%' THEN 0 ELSE 1 END), i.name LIMIT 1) AS instructor
           FROM course c JOIN course_staff cs USING (course_id) JOIN staff s USING (directory_id)
           WHERE cs.directory_id = %s ORDER BY c.course_id""",
        (directory_id,),
    ).fetchall()
    rows = conn.execute(
        """SELECT exam_id, course_id, slug, exam_name, due, kind, short, released_at, status FROM assignment
           WHERE course_id = ANY(%s) ORDER BY due NULLS LAST, exam_id""",
        ([c["course_id"] for c in courses],),
    ).fetchall()
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
    return conn.execute(
        "SELECT 1 FROM course_staff WHERE course_id = %s AND directory_id = %s", (course_id, directory_id)
    ).fetchone() is not None


def is_instructor(conn, directory_id: str) -> bool:
    row = conn.execute("SELECT role FROM staff WHERE directory_id = %s", (directory_id,)).fetchone()
    return row is not None and row["role"] == "instructor"


def create(conn, course_id: int, *, title: str, kind: str, due, short: str | None, slug: str | None) -> dict:
    """Add an assignment. Without a slug, one is made from the title.

    Slugs are unique across all courses because they name upload folders and templates. When another course already
    has the title's slug, the course code goes first ("cmsc351-midterm-1"); a repeat within the course gets -2, -3, ...
    """
    rows = conn.execute("SELECT slug, course_id FROM assignment").fetchall()
    taken = {r["slug"] for r in rows}
    if slug is not None:
        if slug in taken:
            raise HTTPException(409, "An assignment with that ID already exists")
    else:
        other_courses = {r["slug"] for r in rows if r["course_id"] != course_id}
        course = conn.execute("SELECT code FROM course WHERE course_id = %s", (course_id,)).fetchone()
        prefix = course["code"] if course and slugify(title) in other_courses else None
        slug = unique_slug(title, taken, prefix)
    try:
        row = conn.execute(
            """INSERT INTO assignment (course_id, exam_name, due, slug, kind, short) VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING exam_id, course_id, slug, exam_name, due, kind, short, status""",
            (course_id, title, due, slug, kind, short or None),
        ).fetchone()
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "Another assignment just took that ID. Try again.")
    return _shape(row)


def delete(conn, exam_id: int) -> None:
    """Remove one assignment. Its rubric, papers and grades go with it through the foreign keys."""
    conn.execute("DELETE FROM assignment WHERE exam_id = %s", (exam_id,))


def update(conn, exam_id: int, fields: dict) -> dict:
    """Change the given fields (see EDITABLE) of one assignment. Its slug never changes."""
    changes = {EDITABLE[name]: (value or None) if name == "short" else value for name, value in fields.items()}
    if changes:
        assignments = ", ".join(f"{column} = %s" for column in changes)
        conn.execute(f"UPDATE assignment SET {assignments} WHERE exam_id = %s", (*changes.values(), exam_id))
    row = conn.execute(
        "SELECT exam_id, course_id, slug, exam_name, due, kind, short, released_at, status FROM assignment WHERE exam_id = %s",
        (exam_id,),
    ).fetchone()
    return _shape(row)
