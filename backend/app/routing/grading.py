
from typing import Literal, Annotated
from app.grading.service import GradingService, token

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.routing.auth import current_user

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


class Decision(BaseModel):
    record_id: str
    student_uid: str
    qid: str
    grader_directory_id: str
    score: float
    criteria: list[str]
    comment: str | None
    internal_note: str | None
    version: int
    updated_at: str


class RegradeQueue(BaseModel):
    """One open regrade task (a criterion split, or a flagged inconsistency), S3.5.3."""

    id: str
    qid: str
    reason: str
    created_at: str
    pending_student_uids: list[str]



def exam_id(value):
    try:
        return int(value)
    except ValueError:
        raise HTTPException(422,'assignment_id must identify an exam')


def entry(row):
    statuses = {'pending':'pending','inprogress':'in_progress','regrade':'needs_regrade','finished':'done'}
    return dict(student_uid=row['uid'],qid=row['qid'],status=statuses.get((row['status'] or 'pending').lower(),row['status']),
                grader_directory_id=row['directory_id'])


def decision(svc,exam,uid,qid):
    row = svc.db.get_decision_by_student_question(uid,qid,exam_ID=exam)
    if row is None:
        return None
    labels = svc.db.get_decision_label(row['record_id'],exam_ID=exam)
    return dict(record_id=str(row['record_id']),student_uid=uid,qid=qid,
                grader_directory_id=labels[0]['directory_id'] if labels else svc.actor,
                score=row['scores'],criteria=[str(x['label_id']) for x in labels],
                comment=row['comments_remark'],internal_note=row['internal_note'],
                version=int(token([row,labels])[1:9],16),updated_at=row['updated_at'].isoformat())


@router.get('/queue',response_model=list[QueueEntry])
def grading_queue(assignment_id: str,svc: Service,section: str | None=None,mine: bool=False):
    if section is not None:
        raise HTTPException(422,'Sections are not yet stored in enrollment')
    exam = exam_id(assignment_id)
    with svc.access(exam) as (conn,_):
        # Include late-uploaded papers without inventing scores for ungraded work.
        conn.execute("""INSERT INTO mapping(exam_id,uid,qid,status)
          SELECT p.exam_id,p.uid,r.qid,'Pending' FROM studentpaper p JOIN rubric r USING(exam_id)
          JOIN exam e USING(exam_id) JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
          WHERE p.exam_id=%s ON CONFLICT DO NOTHING""",(exam,))
        rows=conn.execute('SELECT * FROM mapping WHERE exam_id=%s ORDER BY uid,qid',(exam,)).fetchall()
        return [entry(r) for r in rows if not mine or r['directory_id']==svc.actor]


@router.post('/questions/{qid}/claim',response_model=QueueEntry)
def claim(assignment_id: str,qid: str,student_uid: str,svc: Service):
    exam=exam_id(assignment_id)
    with svc.access(exam,qid) as (conn,_):
        row=conn.execute("""UPDATE mapping SET directory_id=%s,status=CASE WHEN lower(status)='regrade' THEN 'Regrade' ELSE 'InProgress' END
          WHERE exam_id=%s AND uid=%s AND qid=%s AND (directory_id IS NULL OR directory_id=%s)
          AND lower(status)<>'finished' RETURNING *""",(svc.actor,exam,student_uid,qid,svc.actor)).fetchone()
        if row is None:
            raise HTTPException(409,'Answer unavailable')
        return entry(row)


@router.post('/questions/{qid}/release',response_model=QueueEntry)
def release(assignment_id: str,qid: str,student_uid: str,svc: Service):
    exam=exam_id(assignment_id)
    with svc.access(exam,qid) as (conn,_):
        svc.release(exam,student_uid,qid)
        return entry(conn.execute('SELECT * FROM mapping WHERE exam_id=%s AND uid=%s AND qid=%s',(exam,student_uid,qid)).fetchone())


@router.post('/reassign',response_model=QueueEntry)
def reassign(assignment_id: str,body: ReassignIn,svc: Service):
    exam=exam_id(assignment_id)
    with svc.access(exam,body.qid) as (conn,role):
        if role!='instructor':
            raise HTTPException(403,'Only instructors can reassign')
        if body.grader_directory_id is not None:
            svc.db._validate_graders(conn.cursor(),[body.grader_directory_id],exam)
        row=conn.execute('UPDATE mapping SET directory_id=%s WHERE exam_id=%s AND uid=%s AND qid=%s RETURNING *',
                         (body.grader_directory_id,exam,body.student_uid,body.qid)).fetchone()
        if row is None:
            raise HTTPException(404,'Assignment not found')
        return entry(row)


@router.get('/submissions/{student_uid}/questions/{qid}',response_model=Decision | None)
def get_decision(assignment_id: str,student_uid: str,qid: str,svc: Service):
    exam=exam_id(assignment_id)
    with svc.access(exam,qid) as (conn,role):
        svc._workspace(conn,exam,student_uid,qid,role)
        return decision(svc,exam,student_uid,qid)


@router.put('/submissions/{student_uid}/questions/{qid}/decision',response_model=Decision)
def submit_decision(assignment_id: str,student_uid: str,qid: str,body: DecisionIn,svc: Service):
    exam=exam_id(assignment_id)
    if body.score_override is not None:
        raise HTTPException(422,'Scores are derived from selected criteria; overrides are not supported')
    try:
        labels=[int(x) for x in body.criteria]
    except ValueError:
        raise HTTPException(422,'Criterion IDs must be integers')
    with svc.access(exam,qid) as (conn,role):
        # Save through the same permission/label checks and one transaction as the workflow service.
        state=svc._workspace(conn,exam,student_uid,qid,role,writing=True)
        svc.save(exam,student_uid,qid,labels,body.comment,state['grade_token'],regrade=bool(state['decision']))
        conn.execute('UPDATE decision SET internal_note=%s,updated_at=clock_timestamp() WHERE exam_id=%s AND uid=%s AND qid=%s',
                     (body.internal_note,exam,student_uid,qid))
        return decision(svc,exam,student_uid,qid)


@router.get('/regrade-queues',response_model=list[RegradeQueue])
def regrade_queues(assignment_id: str,svc: Service,qid: str | None=None):
    # Named independent queues need their own model; never pretend Mapping.status is one.
    with svc.access(exam_id(assignment_id)):
        raise HTTPException(501,'Named regrade queues are not implemented')


@router.post('/regrade-queues/{queue_id}/students/{student_uid}/resolve',response_model=Decision)
def resolve_regrade(assignment_id: str,queue_id: str,student_uid: str,body: DecisionIn,svc: Service):
    with svc.access(exam_id(assignment_id)):
        raise HTTPException(501,'Named regrade queues are not implemented')
