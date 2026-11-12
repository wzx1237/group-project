"""Regrade queues (proposal 3.5): split a criterion or flag graded answers, then review each answer in its own queue.

An answer in an open queue keeps its score and stays 'Regrade' in mapping until a grader reviews it in that queue, so
the assignment can't move to review or close while answers are waiting.
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import workflow
from app.database import regrade as regrade_db
from app.database import rubric as rubric_db
from app.grading.exams import resolve_exam
from app.grading.service import GRADING, amount
from app.routing.auth import current_user
from app.routing.grading import Decision, Service, decision
from app.routing.rubrics import Criterion, CriterionIn, criterion

router = APIRouter(prefix='/api/assignments/{assignment_id}', dependencies=[Depends(current_user)])


class RegradeItem(BaseModel):
    student_uid: str
    resolved_by: str | None
    resolved_at: str | None


class RegradeQueue(BaseModel):
    id: str
    qid: str
    kind: Literal['split', 'flag']
    reason: str
    criterion: Criterion | None  # the criterion a split replaced
    replacement_ids: list[str]
    created_by: str | None
    created_at: str
    closed_at: str | None
    items: list[RegradeItem]
    pending_student_uids: list[str]


class FlagIn(BaseModel):
    """Graded answers to one question: all of them, or only these students', or only those with one criterion."""

    qid: str = Field(min_length=1, max_length=50)
    reason: str = Field(min_length=1, max_length=200)
    student_uids: list[str] | None = None
    criterion_id: int | None = None


class SplitIn(BaseModel):
    replacements: list[CriterionIn] = Field(min_length=2, max_length=4)


class SplitOut(BaseModel):
    criteria: list[Criterion]
    queue: RegradeQueue | None  # None when no answer had the criterion


class ResolveIn(BaseModel):
    criteria: list[str]


def _iso(value):
    return value.isoformat() if value else None


def _queues(conn, exam, rows):
    items, replaced = {}, {}
    for row in regrade_db.items(conn, [r['queue_id'] for r in rows]):
        items.setdefault(row['queue_id'], []).append(row)
    for row in regrade_db.replacements(conn, exam, [r['label_id'] for r in rows if r['label_id']]):
        replaced.setdefault(row['split_from'], []).append(str(row['label_id']))
    return [dict(id=str(r['queue_id']), qid=r['qid'], kind=r['kind'], reason=r['reason'],
                 criterion=dict(label_id=str(r['label_id']), title=r['label_title'],
                                description=r['label_description'] or '', deduction=r['label_deduction'])
                 if r['label_id'] else None,
                 replacement_ids=replaced.get(r['label_id'], []),
                 created_by=r['created_by'], created_at=_iso(r['created_at']), closed_at=_iso(r['closed_at']),
                 items=[dict(student_uid=i['uid'], resolved_by=i['resolved_by'], resolved_at=_iso(i['resolved_at']))
                        for i in items.get(r['queue_id'], [])],
                 pending_student_uids=[i['uid'] for i in items.get(r['queue_id'], []) if i['resolved_at'] is None])
            for r in rows]


def _queue(conn, exam, queue_id):
    rows = regrade_db.queues(conn, exam, include_closed=True, queue_id=queue_id)
    if not rows:
        raise HTTPException(404, 'Regrade queue not found')
    return _queues(conn, exam, rows)[0]


@router.get('/regrade-queues', response_model=list[RegradeQueue])
def regrade_queues(assignment_id: str, svc: Service, closed: bool = False):
    """Open queues, newest first; closed ones too with ?closed=true."""
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        return _queues(conn, exam, regrade_db.queues(conn, exam, include_closed=closed))


@router.get('/regrade-queues/{queue_id}', response_model=RegradeQueue)
def regrade_queue(assignment_id: str, queue_id: int, svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        return _queue(conn, exam, queue_id)


@router.post('/regrade-queues', response_model=RegradeQueue, status_code=201)
def flag_for_regrade(assignment_id: str, body: FlagIn, svc: Service):
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(422, 'Say why these answers need another look')
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam, body.qid) as (conn, _):
        workflow.require(conn, exam, GRADING, 'Regrading')
        uids = regrade_db.graded_answers(conn, exam, body.qid, uids=body.student_uids, label_id=body.criterion_id)
        if not uids:
            raise HTTPException(422, 'No graded answers match')
        queue = regrade_db.create_queue(conn, svc.actor, exam, body.qid, 'flag', reason, uids)
        return _queue(conn, exam, queue)


@router.post('/rubric/criteria/{label_id}/split', response_model=SplitOut, status_code=201)
def split_criterion(assignment_id: str, label_id: int, body: SplitIn, svc: Service):
    """Replace a criterion with narrower ones. Answers that had it keep their scores and wait in a new queue until a
    grader picks which replacements apply."""
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        workflow.require(conn, exam, workflow.OPEN, 'Changing the rubric')
        old = svc.db.get_label(label_id, exam_ID=exam)
        if old is None:
            raise HTTPException(404, 'Criterion not found')
        if old['retired_at']:
            raise HTTPException(409, 'This criterion was already split')
        qids = regrade_db.label_questions(conn, exam, label_id)
        if len(qids) != 1:
            raise HTTPException(409, 'Only a criterion on one question can be split')
        qid = qids[0]
        rubric_db.lock_question(conn, exam, qid, edit=True)
        new = []
        for part in body.replacements:
            new.append(regrade_db.add_replacement(conn, exam, label_id, part.title.strip(), part.description,
                                                  amount(part.deduction)))
            svc.db.add_rubric_label(qid, new[-1], exam_ID=exam)
        queue = None
        if regrade_db.label_in_use(conn, exam, label_id):
            regrade_db.retire_label(conn, exam, label_id)
            uids = regrade_db.graded_answers(conn, exam, qid, label_id=label_id)
            if uids:
                queue = regrade_db.create_queue(conn, svc.actor, exam, qid, 'split', f'Split “{old["title"]}”', uids,
                                                label_id)
        else:
            svc.db.remove_label(label_id, exam_ID=exam)
        return dict(criteria=[criterion(svc.db.get_label(i, exam_ID=exam)) for i in new],
                    queue=_queue(conn, exam, queue) if queue else None)


@router.post('/regrade-queues/{queue_id}/students/{student_uid}/resolve', response_model=Decision)
def resolve_regrade(assignment_id: str, queue_id: int, student_uid: str, body: ResolveIn, svc: Service):
    """Save the criteria a grader picked for this answer, which takes it out of the queue."""
    exam = resolve_exam(svc, assignment_id)
    try:
        labels = [int(x) for x in body.criteria]
    except ValueError:
        raise HTTPException(422, 'Criterion IDs must be integers')
    if not labels:
        raise HTTPException(422, 'Pick at least one criterion so the answer stays graded')
    with svc.access(exam) as (conn, role):
        item = regrade_db.lock_item(conn, exam, queue_id, student_uid)
        if item is None:
            raise HTTPException(404, 'This answer is not in that regrade queue')
        if item['closed_at']:
            raise HTTPException(409, 'This regrade queue is closed')
        if item['resolved_at']:
            raise HTTPException(409, 'This answer was already reviewed')
        if item['label_id'] in labels:
            raise HTTPException(422, 'Pick which new criteria apply instead of the one that was split')
        qid = item['qid']
        rubric_db.lock_question(conn, exam, qid)
        state = svc._workspace(conn, exam, student_uid, qid, role, writing=True)
        comment = state['decision']['comments_remark'] if state['decision'] else None
        regrade_db.resolve_item(conn, svc.actor, queue_id, student_uid)
        svc.save(exam, student_uid, qid, labels, comment, state['grade_token'], regrade=bool(state['decision']))
        # A queue closes once its last answer is reviewed.
        if not regrade_db.pending(conn, queue_id):
            regrade_db.close_queue(conn, svc.actor, queue_id)
        return decision(svc, exam, student_uid, qid)


@router.post('/regrade-queues/{queue_id}/close', response_model=RegradeQueue)
def close_regrade_queue(assignment_id: str, queue_id: int, svc: Service):
    """Stop regrading in this queue; answers not reviewed yet keep their scores."""
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        workflow.require(conn, exam, GRADING, 'Regrading')
        if _queue(conn, exam, queue_id)['closed_at']:
            raise HTTPException(409, 'This regrade queue is already closed')
        regrade_db.close_queue(conn, svc.actor, queue_id)
        return _queue(conn, exam, queue_id)
