from typing import Literal, Annotated
from app.grading.exams import resolve_exam
from app import workflow
from app.grading.service import GRADING, GradingService, locked_by, token

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.routing.auth import current_user
from app.database import decision as decision_db
from app.database import grading as grading_db
from app.database import label as label_db
from app.database import locks as locks_db
from app.database import student as student_db
from app.database import studentpaper as studentpaper_db

router = APIRouter(prefix="/api/assignments/{assignment_id}", dependencies=[Depends(current_user)])

def service(request: Request, actor: Annotated[str, Depends(current_user)]):
    if request.app.state.grading_db is None:
        raise HTTPException(503, 'Database unavailable')
    return GradingService(request.app.state.grading_db, actor)


Service = Annotated[GradingService, Depends(service)]


MappingStatus = Literal["pending", "in_progress", "needs_regrade", "done"]


class QueueEntry(BaseModel):

    student_uid: str
    qid: str
    status: MappingStatus
    grader_directory_id: str | None = None


class QuestionProgress(BaseModel):
    """How far grading has got on one question, over enrolled students with a paper."""

    qid: str
    total: int
    finished: int
    regrade: int


class StudentProgress(BaseModel):
    """How far grading has got on one student's exam. `answers` is each question's status, in question order."""

    uid: str
    name: str
    questions: int
    finished: int
    regrade: int
    status: Literal["not_started", "in_progress", "regrade", "graded"]
    answers: dict[str, str]


class ExamProgress(BaseModel):
    questions: list[QuestionProgress]
    students: list[StudentProgress]


class ReassignIn(BaseModel):
    student_uid: str
    qid: str
    grader_directory_id: str | None  


class DecisionIn(BaseModel):
    """What a grader submits for a answer."""

    criteria: list[str]  
    score_override: float | None = None  
    comment: str | None = None  # shown to the student
    internal_note: str | None = None  # staff-only, never shown to the student
    version: int | None = None  # the decision's version the grader last saw, 0 for none; a newer one refuses the save


class Decision(BaseModel):
    record_id: str
    student_uid: str
    qid: str
    grader_directory_id: str
    score: float | None  # None until a criterion is applied
    criteria: list[str]
    comment: str | None
    internal_note: str | None
    version: int
    updated_at: str


class ExamComment(BaseModel):
    """One comment to the student about their whole exam, shown on their report."""

    comment: str | None = Field(default=None, max_length=10000)


class ExamCommentIn(ExamComment):
    # The comment as the grader last loaded it; when sent, a comment changed since then refuses the save.
    expected: str | None = None


class AnswerLock(BaseModel):
    """A grader working on one answer (qid '' is the overall comment). It expires unless the grading page renews it."""

    qid: str
    holder: str
    holder_name: str
    mine: bool
    expires_at: str


class LockIn(BaseModel):
    take_over: bool = False


def lock_out(svc, row):
    return dict(qid=row['qid'], holder=row['holder'], holder_name=row['holder_name'], mine=row['holder'] == svc.actor,
                expires_at=row['expires_at'].isoformat())



def entry(row):
    statuses = {'pending':'pending','inprogress':'in_progress','regrade':'needs_regrade','finished':'done'}
    return dict(student_uid=row['uid'],qid=row['qid'],status=statuses.get((row['status'] or 'pending').lower(),row['status']),
                grader_directory_id=row['directory_id'])


def decision(svc,exam,uid,qid):
    row = svc.db.get_decision_by_student_question(uid,qid,exam_ID=exam)
    if row is None:
        return None
    return decision_out(svc,row,svc.db.get_decision_label(row['record_id'],exam_ID=exam))


def decision_out(svc,row,labels):
    return dict(record_id=str(row['record_id']),student_uid=row['uid'],qid=row['qid'],
                grader_directory_id=labels[0]['directory_id'] if labels else svc.actor,
                score=row['scores'],criteria=[str(x['label_id']) for x in labels],
                comment=row['comments_remark'],internal_note=row['internal_note'],
                version=int(token([row,labels])[1:9],16),updated_at=row['updated_at'].isoformat())


@router.get('/queue',response_model=list[QueueEntry])
def grading_queue(assignment_id: str,svc: Service,section: str | None=None,mine: bool=False):
    if section is not None:
        raise HTTPException(422,'Sections are not yet stored in enrollment')
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn,_):
        # Include late-uploaded papers without inventing scores for ungraded work.
        grading_db.seed_exam_mappings(conn, exam)
        rows=grading_db.exam_mappings(conn, exam)
        return [entry(r) for r in rows if not mine or r['directory_id']==svc.actor]


def student_progress(rows):
    """Group (student, question) rows into one entry per student, in the order given."""
    students = {}
    for row in rows:
        found = students.setdefault(row['uid'], dict(uid=row['uid'], name=row['name'], answers={}))
        found['answers'][row['qid']] = row['status']
    result = []
    for found in students.values():
        states = list(found['answers'].values())
        finished, regrade = states.count('finished'), states.count('regrade')
        if regrade:
            status = 'regrade'
        elif states and finished == len(states):
            status = 'graded'
        elif finished or any(s != 'pending' for s in states):
            status = 'in_progress'
        else:
            status = 'not_started'
        result.append(dict(found, questions=len(states), finished=finished, regrade=regrade, status=status))
    return result


@router.get('/question-progress',response_model=ExamProgress)
def question_progress(assignment_id: str,svc: Service):
    """Grading progress for the whole exam, by question and by student, for any course TA or instructor."""
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn,_):
        return dict(questions=grading_db.exam_question_progress(conn, exam),
                    students=student_progress(grading_db.exam_student_answers(conn, exam)))


@router.post('/questions/{qid}/claim',response_model=QueueEntry)
def claim(assignment_id: str,qid: str,student_uid: str,svc: Service):
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam,qid) as (conn,_):
        workflow.require(conn,exam,GRADING,'Grading')
        row=grading_db.claim_available_answer(conn, svc.actor, exam, student_uid, qid)
        if row is None:
            raise HTTPException(409,'Answer unavailable')
        return entry(row)


@router.post('/questions/{qid}/release',response_model=QueueEntry)
def release(assignment_id: str,qid: str,student_uid: str,svc: Service):
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam,qid) as (conn,_):
        svc.release(exam,student_uid,qid)
        return entry(grading_db.mapping_row(conn, exam, student_uid, qid))


@router.post('/reassign',response_model=QueueEntry)
def reassign(assignment_id: str,body: ReassignIn,svc: Service):
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam,body.qid) as (conn,_):
        workflow.require(conn,exam,GRADING,'Reassigning answers')
        if body.grader_directory_id is not None:
            decision_db._validate_graders(conn, [body.grader_directory_id], exam)
        row=grading_db.reassign_answer(conn, body.grader_directory_id, exam, body.student_uid, body.qid)
        if row is None:
            raise HTTPException(404,'Assignment not found')
        return entry(row)


@router.get('/decisions',response_model=dict[str,dict[str,Decision]])
def exam_decisions(assignment_id: str,svc: Service,student_uid: str | None=None):
    """Every saved decision for enrolled students, by student and question; optionally one student's."""
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn,_):
        rows=decision_db.enrolled_decisions(conn, exam, student_uid)
        labels={}
        for row in label_db.exam_selected_labels(conn, exam, student_uid):
            labels.setdefault(row['record_id'],[]).append(row)
        result={}
        for row in rows:
            result.setdefault(row['uid'],{})[row['qid']]=decision_out(svc,row,labels.get(row['record_id'],[]))
        return result


@router.get('/submissions/{student_uid}/questions/{qid}',response_model=Decision | None)
def get_decision(assignment_id: str,student_uid: str,qid: str,svc: Service):
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam,qid) as (conn,role):
        svc._workspace(conn,exam,student_uid,qid,role)
        return decision(svc,exam,student_uid,qid)


@router.put('/submissions/{student_uid}/questions/{qid}/decision',response_model=Decision)
def submit_decision(assignment_id: str,student_uid: str,qid: str,body: DecisionIn,svc: Service):
    exam=resolve_exam(svc, assignment_id)
    if body.score_override is not None:
        raise HTTPException(422,'Scores are derived from selected criteria; overrides are not supported')
    try:
        labels=[int(x) for x in body.criteria]
    except ValueError:
        raise HTTPException(422,'Criterion IDs must be integers')
    with svc.access(exam,qid) as (conn,role):
        # Save through the same permission/label checks and one transaction as the workflow service.
        state=svc._workspace(conn,exam,student_uid,qid,role,writing=True)
        # Someone saved this answer after the grader last loaded it: refuse rather than overwrite their work.
        current=decision(svc,exam,student_uid,qid)
        if body.version is not None and body.version!=(current['version'] if current else 0):
            raise HTTPException(409,{'message':'This answer changed since you opened it, so it was reloaded','stale':True})
        svc.save(exam,student_uid,qid,labels,body.comment,state['grade_token'],regrade=bool(state['decision']))
        decision_db.set_internal_note(conn, body.internal_note, exam, student_uid, qid)
        return decision(svc,exam,student_uid,qid)


@router.get('/submissions/{student_uid}/locks',response_model=list[AnswerLock])
def answer_locks(assignment_id: str,student_uid: str,svc: Service):
    """Who is grading which of this student's answers right now."""
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn,_):
        return [lock_out(svc,row) for row in locks_db.locks(conn,exam,student_uid)]


@router.put('/submissions/{student_uid}/questions/{qid}/lock',response_model=AnswerLock)
def lock_answer(assignment_id: str,student_uid: str,qid: str,body: LockIn,svc: Service):
    """Hold an answer while grading it, or renew the hold. Taking over another grader's hold must be asked for."""
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam,qid) as (conn,role):
        workflow.require(conn,exam,GRADING,'Grading')
        svc._workspace(conn,exam,student_uid,qid,role)
        if locks_db.take(conn,svc.actor,exam,student_uid,qid,take_over=body.take_over) is None:
            raise locked_by(locks_db.holder(conn,exam,student_uid,qid))
        return lock_out(svc,locks_db.holder(conn,exam,student_uid,qid))


@router.post('/submissions/{student_uid}/locks/release',status_code=204)
def release_answer_locks(assignment_id: str,student_uid: str,svc: Service):
    """Let go of this grader's holds on the student's answers. A POST, so a closing page can send it as a beacon."""
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn,_):
        locks_db.release(conn,svc.actor,exam,student_uid)


def paper_comment(conn,exam,student_uid,*,lock=False):
    # Recheck enrollment; a retained paper alone does not grant access.
    if not student_db.lock_exam_enrollment(conn,exam,student_uid):
        raise HTTPException(404,'Student is not enrolled in this course')
    row=studentpaper_db.paper_comment(conn,exam,student_uid,lock=lock)
    if row is None:
        raise HTTPException(404,'No scanned exam for this student')
    return row


@router.get('/submissions/{student_uid}/comment',response_model=ExamComment)
def get_exam_comment(assignment_id: str,student_uid: str,svc: Service):
    """The comment to the student about their whole exam, as opposed to one question."""
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn,_):
        return ExamComment(comment=paper_comment(conn,exam,student_uid)['comments'])


@router.put('/submissions/{student_uid}/comment',response_model=ExamComment)
def set_exam_comment(assignment_id: str,student_uid: str,body: ExamCommentIn,svc: Service):
    exam=resolve_exam(svc, assignment_id)
    comment=(body.comment or '').strip() or None
    with svc.access(exam) as (conn,_):
        workflow.require(conn,exam,GRADING,'Commenting on an exam')
        current=paper_comment(conn,exam,student_uid,lock=True)['comments']
        # Like an answer: saving takes the comment's lock, and a save based on an older comment is refused.
        if locks_db.take(conn,svc.actor,exam,student_uid,locks_db.COMMENT) is None:
            raise locked_by(locks_db.holder(conn,exam,student_uid,locks_db.COMMENT),'writing this comment')
        if 'expected' in body.model_fields_set and (body.expected or None)!=current:
            raise HTTPException(409,{'message':'This comment changed since you opened it, so it was reloaded','stale':True})
        studentpaper_db.set_paper_comment(conn,comment,exam,student_uid)
        return ExamComment(comment=comment)


@router.put('/submissions/{student_uid}/comment/lock',response_model=AnswerLock)
def lock_exam_comment(assignment_id: str,student_uid: str,body: LockIn,svc: Service):
    """Hold the student's overall comment while writing it, or renew the hold."""
    exam=resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn,_):
        workflow.require(conn,exam,GRADING,'Commenting on an exam')
        paper_comment(conn,exam,student_uid)
        if locks_db.take(conn,svc.actor,exam,student_uid,locks_db.COMMENT,take_over=body.take_over) is None:
            raise locked_by(locks_db.holder(conn,exam,student_uid,locks_db.COMMENT),'writing this comment')
        return lock_out(svc,locks_db.holder(conn,exam,student_uid,locks_db.COMMENT))
