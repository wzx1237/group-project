"""Rubric reads and adding a shared label with atomic regrade propagation."""
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import workflow
from app.grading.service import amount
from app.routing.grading_compat import Expected, Service

router = APIRouter(prefix='/api/exams')


class CriterionIn(BaseModel):
    title: str = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=10000)
    deduction: Annotated[Decimal, Field(max_digits=5, decimal_places=2, allow_inf_nan=False)]


class QuestionIn(BaseModel):
    qid: str = Field(min_length=1, max_length=50)
    grading_method: Literal['manual', 'auto_numeric', 'auto_match'] = 'manual'
    total_score: Annotated[Decimal, Field(ge=0, max_digits=5, decimal_places=2)]


@router.get('/{exam_ID}/questions/{QID}/rubric')
def rubric(exam_ID: int, QID: str, svc: Service):
    return svc.rubric_snapshot(exam_ID, QID)


@router.post('/{exam_ID}/questions/{QID}/rubric/labels', status_code=201)
def add_label(exam_ID: int, QID: str, body: CriterionIn, svc: Service, if_match: Expected = None):
    return svc.change_rubric(exam_ID, QID, body.title, body.description, body.deduction, if_match)


@router.post('/{exam_ID}/rubric/questions', status_code=201)
def add_question(exam_ID: int, body: QuestionIn, svc: Service):
    """Initialize a question; existing exam creation/assignment methods stay intact."""
    with svc.access(exam_ID) as (conn, _):
        workflow.require(conn, exam_ID, ('draft',), 'Adding a question')
        conn.execute('INSERT INTO rubric(exam_id,qid,grading_method,total_scores) VALUES(%s,%s,%s,%s)',
                     (exam_ID, body.qid, body.grading_method, amount(body.total_score)))
        conn.execute('''INSERT INTO mapping(exam_id,uid,qid,status)
            SELECT p.exam_id,p.uid,%s,'Pending' FROM studentpaper p
            JOIN assignment e USING(exam_id) JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
            WHERE p.exam_id=%s ON CONFLICT DO NOTHING''', (body.qid, exam_ID))
        return body
