"""Course discovery, exclusive grading workspaces and atomic decisions."""
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.grading.service import GradingService
from app.routing.auth import current_user

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
        return conn.execute('''SELECT c.*,cs.role FROM course c JOIN course_staff cs USING(course_id)
            WHERE cs.directory_id=%s ORDER BY c.course_id''', (svc.actor,)).fetchall()


@router.get('/courses/{course_ID}/questions')
def course_questions(course_ID: int, svc: Service):
    """Exam/question choices with this TA's outstanding and available work."""
    with svc.db.audit_context(actor_ID=svc.actor), svc.db.get_connection() as conn:
        membership = conn.execute('SELECT role FROM course_staff WHERE course_id=%s AND directory_id=%s FOR SHARE',
                                  (course_ID, svc.actor)).fetchone()
        if membership is None:
            raise HTTPException(403, 'Not a member of this course')
        return conn.execute('''SELECT e.exam_id,e.exam_name,r.qid,r.grading_method,r.total_scores,
            count(m.uid) FILTER (WHERE m.directory_id=%s) AS assigned,
            count(m.uid) FILTER (WHERE m.directory_id=%s AND lower(m.status)='finished') AS finished,
            count(m.uid) FILTER (WHERE m.directory_id=%s AND lower(m.status)='regrade') AS regrade,
            (SELECT count(*) FROM studentpaper p JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
             WHERE p.exam_id=e.exam_id AND NOT EXISTS
             (SELECT 1 FROM mapping other WHERE other.exam_id=e.exam_id AND other.uid=p.uid AND other.qid=r.qid
              AND (other.directory_id IS NOT NULL AND other.directory_id<>%s OR lower(other.status)='finished')))
             AS available
            FROM exam e JOIN rubric r USING(exam_id) LEFT JOIN mapping m USING(exam_id,qid)
            WHERE e.course_id=%s GROUP BY e.exam_id,r.exam_id,r.qid ORDER BY e.exam_id,r.qid''',
                            (svc.actor, svc.actor, svc.actor, svc.actor, course_ID)).fetchall()


@router.get('/exams/{exam_ID}/students/{UID}/questions/{QID}/workspace')
def workspace(exam_ID: int, UID: int, QID: str, svc: Service):
    return svc.workspace(exam_ID, UID, QID)


@router.post('/exams/{exam_ID}/questions/{QID}/start')
def start(exam_ID: int, QID: str, svc: Service):
    """Atomically claim/resume one answer and return its PDF URL and rubric."""
    return svc.start(exam_ID, QID)


@router.post('/exams/{exam_ID}/students/{UID}/questions/{QID}/release')
def release(exam_ID: int, UID: int, QID: str, svc: Service):
    return svc.release(exam_ID, UID, QID)


@router.get('/exams/{exam_ID}/students/{UID}/questions/{QID}/pdf')
def pdf(exam_ID: int, UID: int, QID: str, svc: Service):
    path = svc.pdf(exam_ID, UID, QID)
    return FileResponse(path, media_type='application/pdf', filename=f'{UID}.pdf',
                        content_disposition_type='inline', headers={'Cache-Control': 'no-store'})


@router.post('/exams/{exam_ID}/students/{UID}/questions/{QID}/grade', status_code=201)
def grade(exam_ID: int, UID: int, QID: str, body: GradeIn, svc: Service, if_match: Expected = None):
    check_actor(svc, body)
    return svc.save(exam_ID, UID, QID, body.labels, body.comments, if_match)


@router.put('/exams/{exam_ID}/students/{UID}/questions/{QID}/grade')
def regrade(exam_ID: int, UID: int, QID: str, body: GradeIn, svc: Service, if_match: Expected = None):
    check_actor(svc, body)
    return svc.save(exam_ID, UID, QID, body.labels, body.comments, if_match, regrade=True)
