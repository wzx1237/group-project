"""Create courses, and create and edit a course's assignments. Reading them is done by /api/courses and /api/course."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app import assignments, cover_templates, store, workflow
from app.assignments import courses_for
from app.routing.auth import current_user
from app.database import course as course_db
from app.database import staff as staff_db

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


class StatusIn(BaseModel):
    status: Literal[workflow.STATUSES]
    confirm: bool = False  # required to move back to an earlier status


class StudentMarkIn(BaseModel):
    """Excuse a student (makeup pending) or mark them a no-show (0); null undoes either."""
    status: Literal[workflow.MARKS] | None
    note: str | None = Field(default=None, max_length=500)


class CourseIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    term: str = Field(min_length=1, max_length=30)
    title: str | None = Field(default=None, max_length=100)


class CourseEdit(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=20)
    term: str | None = Field(default=None, min_length=1, max_length=30)
    title: str | None = Field(default=None, max_length=100)
    image: str | None = None


@router.post('/courses', status_code=201)
def create_course(body: CourseIn, request: Request, user: Staff):
    """Instructors create a course and are added to its staff."""
    code, term, title = body.code.strip(), body.term.strip(), (body.title or '').strip() or None
    if not (code and term):
        raise HTTPException(422, 'Enter a course code and term')
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.transaction(), db.get_connection() as conn:
        staff = staff_db.staff_role(conn, user)
        if staff is None or staff['role'] != 'instructor':
            raise HTTPException(403, 'Only instructors can create courses')
        row = course_db.create_course(conn, code, term, title)
        if row is None:
            raise HTTPException(409, f'{code} {term} already exists')
        staff_db.add_course_member(conn, row['course_id'], user)
        return next(c for c in courses_for(conn, user) if c['course_id'] == row['course_id'])


@router.patch('/courses/{course_id}')
def edit_course(course_id: int, body: CourseEdit, request: Request, user: Staff):
    """Course staff edit a course's code, term, title, or banner image."""
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.transaction(), db.get_connection() as conn:
        if not assignments.is_member(conn, course_id, user):
            raise HTTPException(403, 'Not a member of this course')
        # change to course exist
        existing = course_db.course_exists(conn, course_id)
        if existing is None:
            raise HTTPException(404, 'Course not found')

        changes = {}
        for field in ("code", "term", "title", "image"):
            value = getattr(body, field)
            if value is None:
                continue
            value = value.strip()
            if field in ("code", "term") and not value:
                raise HTTPException(422, f"Course {field} cannot be empty")
            changes[field] = value or None
        course_db.update_course_columns(conn, course_id, changes)

        return next((c for c in courses_for(conn, user) if c['course_id'] == course_id), None)



@router.post('/courses/{course_id}/assignments', status_code=201)
def create_assignment(course_id: int, body: AssignmentIn, request: Request, user: Staff):
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.get_connection() as conn:
        if not assignments.is_member(conn, course_id, user):
            raise HTTPException(403, 'Not a member of this course')
        if not assignments.is_instructor(conn, user):
            raise HTTPException(403, 'Only instructors can create exams')
        return assignments.create(conn, course_id, **body.model_dump())


@router.patch('/assignments/{assignment_id}')
def edit_assignment(assignment_id: str, body: AssignmentEdit, request: Request, user: Staff):
    fields = body.model_dump(exclude_unset=True)
    if any(fields.get(name, 0) is None for name in ('title', 'kind')):
        raise HTTPException(422, 'title and kind cannot be null')
    current = assignments.find(request.app.state.db, user, assignment_id)
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.get_connection() as conn:
        if not assignments.is_instructor(conn, user):
            raise HTTPException(403, 'Only instructors can edit assignments')
        return assignments.update(conn, current['exam_id'], fields)


@router.delete('/assignments/{assignment_id}', status_code=204)
def delete_assignment(assignment_id: str, request: Request, user: Staff):
    current = assignments.find(request.app.state.db, user, assignment_id)
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.transaction(), db.get_connection() as conn:
        if not assignments.is_instructor(conn, user):
            raise HTTPException(403, 'Only instructors can delete assignments')
        assignments.delete(conn, current['exam_id'])
    # after the database delete has committed, remove its uploads and every file saved for it
    store.update(lambda data: data.update(assignments=[a for a in data['assignments'] if a['id'] != assignment_id]))
    cover_templates.delete_files(assignment_id)


@router.put('/assignments/{assignment_id}/status')
def change_status(assignment_id: str, body: StatusIn, request: Request, user: Staff):
    """Move the assignment through draft -> collecting -> grading -> in_review -> closed (see app.workflow)."""
    current = assignments.find(request.app.state.db, user, assignment_id)
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.transaction(), db.get_connection() as conn:
        workflow.change_status(conn, current['exam_id'], body.status, user, confirm=body.confirm)
        return assignments.update(conn, current['exam_id'], {})


@router.put('/assignments/{assignment_id}/students/{uid}/status')
def mark_student(assignment_id: str, uid: str, body: StudentMarkIn, request: Request, user: Staff):
    current = assignments.find(request.app.state.db, user, assignment_id)
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.transaction(), db.get_connection() as conn:
        return workflow.mark_student(conn, current['exam_id'], uid, body.status, user, body.note)
