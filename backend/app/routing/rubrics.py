from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from app.routing.grading import Service
from app.grading.exams import resolve_exam
from app import workflow
from app.grading.service import amount, token

from app.routing.auth import current_user
from app.database import grading as grading_db
from app.database import rubric as rubric_db
from app.database import label as label_db

router = APIRouter(prefix="/api/assignments/{assignment_id}/rubric", dependencies=[Depends(current_user)])

GradingMethod = Literal["manual", "auto_numeric", "auto_match"]
# "deduct" starts at full points and criteria take points off; "add" starts at 0.
Scoring = Literal["add", "deduct"]


class Criterion(BaseModel):
    """One reusable grading criterion ("Label" in the data model)."""

    label_id: str
    title: str  
    description: str = ""  # grader-only detail not shown to students
    deduction: float = 0.0  # negative = deduction positive = credit


class CriterionIn(BaseModel):
    title: str = Field(min_length=1, max_length=50)
    description: str = ""
    deduction: float = 0.0


class Question(BaseModel):
    """One rubric question (a "Rubric" row plus its linked "Label"s)."""

    qid: str = Field(min_length=1, max_length=50)
    title: str = ""
    region: dict | None = None
    grading_method: GradingMethod
    scoring: Scoring = "add"
    total_score: float
    criteria: list[Criterion] = []


class QuestionIn(BaseModel):
    qid: str = Field(min_length=1, max_length=50)
    title: str = ""
    region: dict | None = None
    grading_method: GradingMethod = "manual"
    scoring: Scoring = "add"
    total_score: float


class RubricOut(BaseModel):
    assignment_id: str
    version: int
    questions: list[Question]


class CopyRubricIn(BaseModel):
    from_assignment_id: str


class ImportRubricIn(BaseModel):
    markdown: str



def question(svc, exam, qid):
    row = svc.db.get_rubric(qid, exam_ID=exam)
    if row is None:
        raise HTTPException(404, 'Question not found')
    return dict(qid=qid, title=row['title'] or '', region=row['region'],
                grading_method=row['grading_method'], scoring=row['scoring'], total_score=row['total_scores'],
                criteria=[criterion(x) for x in svc.db.get_rubric_labels(qid, exam_ID=exam)])


def criterion(row):
    return dict(label_id=str(row['label_id']), title=row['title'],
                description=row['description'] or '', deduction=row['deduction'])


@router.get('', response_model=RubricOut)
def get_rubric(assignment_id: str, svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        rows = rubric_db.question_ids(conn, exam)
        questions = [question(svc,exam,r['qid']) for r in rows]
        # A content revision preserves the frontend shape without restoring relationship versions.
        version = int(token(questions)[1:9],16)
        return dict(assignment_id=assignment_id,version=version,questions=questions)


@router.post('/questions', response_model=Question, status_code=201)
def add_question(assignment_id: str, body: QuestionIn, svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        workflow.require(conn, exam, ('draft',), 'Adding a question')
        rubric_db.add_question(conn, body.qid, body.title, body.grading_method, amount(body.total_score), body.region, body.scoring, exam_ID=exam)
        grading_db.seed_question_mappings(conn, body.qid, exam)
        return question(svc,exam,body.qid)


@router.patch('/questions/{qid}', response_model=Question)
def update_question(assignment_id: str, qid: str, body: QuestionIn, svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam,qid,edit=True) as (conn,_):
        if body.qid != qid:
            raise HTTPException(422,'Question ID cannot change; create a new question instead')
        # Regions locate answers on the scans, so they are fixed once scans are collected.
        moved = body.region != rubric_db.get_rubric(conn, qid, exam_ID=exam)['region']
        workflow.require(conn,exam,('draft',) if moved else workflow.OPEN,'Moving a region' if moved else 'Editing a question')
        rubric_db.edit_question(conn, qid, body.title, body.grading_method, amount(body.total_score), body.region, body.scoring, exam_ID=exam)
        return question(svc,exam,qid)


@router.delete('/questions/{qid}', status_code=204)
def retire_question(assignment_id: str, qid: str, svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam,qid,edit=True) as (conn,_):
        workflow.require(conn,exam,('draft',),'Removing a question')
        rubric_db.remove_question(conn, qid, exam_ID=exam)


@router.post('/questions/{qid}/criteria', response_model=Criterion,status_code=201)
def add_criterion(assignment_id: str,qid: str,body: CriterionIn,svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam,qid,edit=True) as (conn,_):
        workflow.require(conn,exam,workflow.OPEN,'Changing the rubric')
        label = label_db.add_label(conn, body.title, body.description, amount(body.deduction), exam_ID=exam)
        rubric_db.add_rubric_label(conn, qid, label, exam_ID=exam)
        # A new criterion requires review; it must not select itself on old answers.
        grading_db.mark_question_for_regrade(conn, exam, qid)
        return criterion(label_db.get_label(conn, label, exam_ID=exam))


@router.patch('/criteria/{label_id}',response_model=Criterion)
def update_criterion(assignment_id: str,label_id: int,body: CriterionIn,svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn,_):
        workflow.require(conn,exam,workflow.OPEN,'Changing the rubric')
        if not label_db.edit_label(conn, label_id, body.title, body.description, amount(body.deduction), exam_ID=exam):
            raise HTTPException(404,'Criterion not found')
        return criterion(label_db.get_label(conn, label_id, exam_ID=exam))


@router.delete('/criteria/{label_id}',status_code=204)
def retire_criterion(assignment_id: str,label_id: int,svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn,_):
        workflow.require(conn,exam,workflow.OPEN,'Changing the rubric')
        if not label_db.remove_label(conn, label_id, exam_ID=exam):
            raise HTTPException(404,'Criterion not found')
