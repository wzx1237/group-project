import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from app.routing.grading import Service
from app.grading.exams import resolve_exam
from app import workflow
from app.grading.rubric_import import (
    apply_imported_rubric,
    export_rubric_markdown,
    parse_rubric_markdown,
    read_rubric_questions,
)
from app.grading.service import amount, token

from app.routing.auth import current_user
from app.database import exam as exam_db
from app.database import label as label_db
from app.database import grading as grading_db
from app.database import regrade as regrade_db
from app.database import rubric as rubric_db
from app.database import staff as staff_db

router = APIRouter(prefix="/api/assignments/{assignment_id}/rubric", dependencies=[Depends(current_user)])
sources_router = APIRouter(prefix="/api/rubrics", dependencies=[Depends(current_user)])

GradingMethod = Literal["manual", "auto_numeric", "auto_match"]
# "deduct" starts at full points and criteria take points off; "add" starts at 0.
Scoring = Literal["add", "deduct"]
ImportMode = Literal["replace", "append_questions", "merge_criteria"]


class Criterion(BaseModel):
    """One reusable grading criterion ("Label" in the data model)."""

    label_id: str
    title: str  
    description: str = ""  # grader-only detail not shown to students
    deduction: float = 0.0  # negative = deduction positive = credit
    applied: int = 0  # enrolled students' answers it is applied to


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
    retired_criteria: list[Criterion] = []  # split criteria, kept only on answers still waiting for regrade
    graded: int = 0  # enrolled students' answers with a score


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


class RubricSourceOut(BaseModel):
    assignment_id: str
    exam_id: int
    title: str
    kind: str
    due: str | None = None
    status: str
    course_id: int
    course_code: str
    course_term: str
    course_title: str | None = None
    question_count: int
    gradable_count: int
    criteria_count: int
    total_points: float


class QuestionMappingIn(BaseModel):
    source_qid: str = Field(min_length=1, max_length=50)
    target_qid: str = Field(min_length=1, max_length=50)


class ImportSummary(BaseModel):
    questions_added: int
    criteria_added: int
    criteria_skipped: int
    affected_graded_qids: list[str] = []


class ImportRubricOut(RubricOut):
    summary: ImportSummary


class CopyRubricIn(BaseModel):
    from_assignment_id: str = Field(min_length=1)
    mode: ImportMode = "replace"
    source_qids: list[str] | None = None
    question_mappings: list[QuestionMappingIn] | None = None
    include_question_details: bool = False
    replace_unused_criteria: bool = False
    copy_regions: bool = False


class ImportRubricIn(BaseModel):
    markdown: str
    mode: ImportMode = "replace"
    source_qids: list[str] | None = None
    question_mappings: list[QuestionMappingIn] | None = None
    include_question_details: bool = False
    replace_unused_criteria: bool = False


def _rubric_snapshot(svc, conn, assignment_id: str, exam: int) -> dict:
    rows = rubric_db.question_ids(conn, exam)
    usage, graded = regrade_db.criterion_usage(conn, exam), regrade_db.graded_counts(conn, exam)
    questions = [question(svc, exam, r["qid"], usage, graded) for r in rows]
    # A content revision preserves the frontend shape without restoring relationship versions.
    version = int(token(questions)[1:9], 16)
    return dict(assignment_id=assignment_id, version=version, questions=questions)



def question(svc, exam, qid, usage=None, graded=None):
    row = svc.db.get_rubric(qid, exam_ID=exam)
    if row is None:
        raise HTTPException(404, 'Question not found')
    labels = svc.db.get_rubric_labels(qid, exam_ID=exam)
    return dict(qid=qid, title=row['title'] or '', region=row['region'],
                grading_method=row['grading_method'], scoring=row['scoring'], total_score=row['total_scores'],
                criteria=[criterion(x, usage) for x in labels if not x['retired_at']],
                retired_criteria=[criterion(x, usage) for x in labels if x['retired_at']],
                graded=(graded or {}).get(qid, 0))


def criterion(row, usage=None):
    return dict(label_id=str(row['label_id']), title=row['title'],
                description=row['description'] or '', deduction=row['deduction'],
                applied=(usage or {}).get(row['label_id'], 0))


@sources_router.get('/sources', response_model=list[RubricSourceOut])
def list_rubric_sources(svc: Service, exclude_assignment_id: str | None = None):
    """List assignments with rubrics that the signed-in staff member can import from."""
    with svc.db.get_connection() as conn:
        exclude_exam_id = rubric_db.resolve_assignment_exam_id(conn, exclude_assignment_id)
        rows = rubric_db.import_sources(conn, svc.actor, exclude_exam_id=exclude_exam_id)
        return [
            {
                **row,
                'due': row['due'].isoformat() if row.get('due') else None,
                'total_points': float(row['total_points']),
            }
            for row in rows
        ]


@router.get('', response_model=RubricOut)
def get_rubric(assignment_id: str, svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        return _rubric_snapshot(svc, conn, assignment_id, exam)


@router.get('/export')
def export_rubric(assignment_id: str, svc: Service):
    """Export an assignment's active rubric as Markdown."""
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        info = exam_db.get_assignment(conn, exam)
        questions = read_rubric_questions(conn, exam)
        markdown = export_rubric_markdown(questions, exam_title=info['exam_name'] if info else None)
    safe_name = re.sub(r'[^A-Za-z0-9._-]', '-', assignment_id) or 'rubric'
    return PlainTextResponse(
        content=markdown,
        media_type='text/markdown; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="{safe_name}-rubric.md"'},
    )


@router.post('/copy', response_model=ImportRubricOut)
def copy_rubric(assignment_id: str, body: CopyRubricIn, svc: Service):
    """Import questions or criteria from another assignment the caller staffs."""
    target_exam = resolve_exam(svc, assignment_id)
    source_exam = resolve_exam(svc, body.from_assignment_id)
    if target_exam == source_exam:
        raise HTTPException(422, 'Choose a different assignment to import from')
    mappings = [m.model_dump() for m in body.question_mappings] if body.question_mappings is not None else None
    with svc.db.audit_context(actor_ID=svc.actor), svc.db.transaction(), svc.db.get_connection() as conn:
        grading_db.set_lock_timeout(conn)
        grading_db.set_statement_timeout(conn)
        # Lock both assignments in ascending exam_id order to prevent cross-exam deadlocks.
        for eid in sorted((target_exam, source_exam)):
            if not exam_db.lock_exam(conn, eid):
                raise HTTPException(404, 'Assignment not found')
            if staff_db.lock_exam_membership(conn, eid, svc.actor) is None:
                raise HTTPException(403, 'Not a member of this exam course')
        source_questions = read_rubric_questions(conn, source_exam)
        if not source_questions:
            raise HTTPException(422, 'The selected assignment has no rubric questions to import')
        summary = apply_imported_rubric(
            svc,
            conn,
            target_exam,
            source_questions,
            mode=body.mode,
            source_qids=body.source_qids,
            question_mappings=mappings,
            include_question_details=body.include_question_details,
            replace_unused_criteria=body.replace_unused_criteria,
            copy_regions=body.copy_regions,
        )
        return {**_rubric_snapshot(svc, conn, assignment_id, target_exam), 'summary': summary}


@router.post('/import', response_model=ImportRubricOut)
def import_rubric(assignment_id: str, body: ImportRubricIn, svc: Service):
    """Import questions or criteria from GradeFlow rubric Markdown."""
    target_exam = resolve_exam(svc, assignment_id)
    source_questions = parse_rubric_markdown(body.markdown)
    mappings = [m.model_dump() for m in body.question_mappings] if body.question_mappings is not None else None
    with svc.access(target_exam) as (conn, _):
        summary = apply_imported_rubric(
            svc,
            conn,
            target_exam,
            source_questions,
            mode=body.mode,
            source_qids=body.source_qids,
            question_mappings=mappings,
            include_question_details=body.include_question_details,
            replace_unused_criteria=body.replace_unused_criteria,
            copy_regions=False,
        )
        return {**_rubric_snapshot(svc, conn, assignment_id, target_exam), 'summary': summary}


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
        label = svc.db.add_label(body.title,body.description,amount(body.deduction),exam_ID=exam)
        svc.db.add_rubric_label(qid,label,exam_ID=exam)
        # Answers graded before it existed keep their grades; the page offers to put them in a regrade queue.
        return criterion(svc.db.get_label(label,exam_ID=exam))


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
        if (svc.db.get_label(label_id,exam_ID=exam) or {}).get('retired_at'):
            raise HTTPException(409,'This criterion was split; it stays on its answers until they are regraded')
        if not svc.db.remove_label(label_id,exam_ID=exam):
            raise HTTPException(404,'Criterion not found')
