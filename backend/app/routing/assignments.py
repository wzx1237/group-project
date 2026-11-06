"""Create courses, and create and edit a course's assignments. Reading them is done by /api/courses and /api/course."""
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app import assignments
from app.assignments import courses_for
from app.routing.auth import current_user

router = APIRouter(prefix='/api')

Kind = Literal[assignments.KINDS]
Staff = Annotated[str, Depends(current_user)]


class AssignmentIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    kind: Kind = 'exam'
    due: date | None = None
    short: str | None = Field(default=None, max_length=20)
    slug: str | None = Field(default=None, max_length=50, pattern=assignments.SLUG_PATTERN)  # made from the title if omitted


class AssignmentEdit(BaseModel):
    """Only the fields that are sent change. `due` and `short` may be null to clear them."""
    title: str | None = Field(default=None, min_length=1, max_length=100)
    kind: Kind | None = None
    due: date | None = None
    short: str | None = Field(default=None, max_length=20)


class CourseIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    term: str = Field(min_length=1, max_length=30)
    title: str | None = Field(default=None, max_length=100)


@router.post('/courses', status_code=201)
def create_course(body: CourseIn, request: Request, user: Staff):
    """Instructors create a course and are added to its staff."""
    code, term, title = body.code.strip(), body.term.strip(), (body.title or '').strip() or None
    if not (code and term):
        raise HTTPException(422, 'Enter a course code and term')
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.transaction(), db.get_connection() as conn:
        staff = conn.execute('SELECT role FROM staff WHERE directory_id = %s', (user,)).fetchone()
        if staff is None or staff['role'] != 'instructor':
            raise HTTPException(403, 'Only instructors can create courses')
        row = conn.execute(
            """INSERT INTO course (code, term, title) VALUES (%s, %s, %s)
               ON CONFLICT (code, term) DO NOTHING RETURNING course_id""",
            (code, term, title),
        ).fetchone()
        if row is None:
            raise HTTPException(409, f'{code} {term} already exists')
        conn.execute('INSERT INTO course_staff (course_id, directory_id) VALUES (%s, %s)', (row['course_id'], user))
        return next(c for c in courses_for(conn, user) if c['course_id'] == row['course_id'])


@router.post('/courses/{course_id}/assignments', status_code=201)
def create_assignment(course_id: int, body: AssignmentIn, request: Request, user: Staff):
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.get_connection() as conn:
        if not assignments.is_member(conn, course_id, user):
            raise HTTPException(403, 'Not a member of this course')
        return assignments.create(conn, course_id, **body.model_dump())


@router.patch('/assignments/{assignment_id}')
def edit_assignment(assignment_id: str, body: AssignmentEdit, request: Request, user: Staff):
    fields = body.model_dump(exclude_unset=True)
    if any(fields.get(name, 0) is None for name in ('title', 'kind')):
        raise HTTPException(422, 'title and kind cannot be null')
    current = assignments.find(request.app.state.db, user, assignment_id)
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.get_connection() as conn:
        return assignments.update(conn, current['exam_id'], fields)
