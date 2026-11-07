"""Course discovery, exclusive grading workspaces and atomic decisions."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.assignments import courses_for
from app.grading.service import GradingService
from app.routing.auth import current_user
from app.database import grading as grading_db
from app.database import staff as staff_db

router = APIRouter(prefix='/api')


def service(request: Request, actor: Annotated[str, Depends(current_user)]):
    return GradingService(request.app.state.grading_db, actor)


Service = Annotated[GradingService, Depends(service)]
Expected = Annotated[str | None, Header(alias='If-Match')]


class GradeIn(BaseModel):
    labels: list[Annotated[int, Field(gt=0)]]
    comments: str | None = Field(default=None, max_length=10000)
    directory_ID: str | None = None  # Compatibility only; identity comes from CAS.


def check_actor(svc, body):
    if body.directory_ID is not None and body.directory_ID != svc.actor:
        raise HTTPException(403, 'directory_ID must match the signed-in user')


@router.get('/courses')
def courses(svc: Service):
    with svc.db.audit_context(actor_ID=svc.actor), svc.db.get_connection() as conn:
        return courses_for(conn, svc.actor)


@router.get('/courses/{course_ID}/questions')
def course_questions(course_ID: int, svc: Service):
    """Exam/question choices with this TA's outstanding and available work."""
    with svc.db.audit_context(actor_ID=svc.actor), svc.db.get_connection() as conn:
        membership = staff_db.lock_course_membership(conn, course_ID, svc.actor)
        if membership is None:
            raise HTTPException(403, 'Not a member of this course')
        return grading_db.course_question_progress(conn, svc.actor, course_ID)


@router.get('/exams/{exam_ID}/students/{UID}/questions/{QID}/workspace')
def workspace(exam_ID: int, UID: str, QID: str, svc: Service):
    return svc.workspace(exam_ID, UID, QID)


@router.post('/exams/{exam_ID}/questions/{QID}/start')
def start(exam_ID: int, QID: str, svc: Service):
    """Atomically claim/resume one answer and return its PDF URL and rubric."""
    return svc.start(exam_ID, QID)


@router.post('/exams/{exam_ID}/students/{UID}/questions/{QID}/release')
def release(exam_ID: int, UID: str, QID: str, svc: Service):
    return svc.release(exam_ID, UID, QID)


@router.get('/exams/{exam_ID}/students/{UID}/questions/{QID}/pdf')
def pdf(exam_ID: int, UID: str, QID: str, svc: Service):
    path = svc.pdf(exam_ID, UID, QID)
    return FileResponse(path, media_type='application/pdf', filename=f'{UID}.pdf',
                        content_disposition_type='inline', headers={'Cache-Control': 'no-store'})


@router.post('/exams/{exam_ID}/students/{UID}/questions/{QID}/grade', status_code=201)
def grade(exam_ID: int, UID: str, QID: str, body: GradeIn, svc: Service, if_match: Expected = None):
    check_actor(svc, body)
    return svc.save(exam_ID, UID, QID, body.labels, body.comments, if_match)


@router.put('/exams/{exam_ID}/students/{UID}/questions/{QID}/grade')
def regrade(exam_ID: int, UID: str, QID: str, body: GradeIn, svc: Service, if_match: Expected = None):
    check_actor(svc, body)
    return svc.save(exam_ID, UID, QID, body.labels, body.comments, if_match, regrade=True)
