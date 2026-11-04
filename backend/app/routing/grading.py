
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routing.auth import current_user

router = APIRouter(prefix="/api/assignments/{assignment_id}", dependencies=[Depends(current_user)])

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


@router.get("/queue", response_model=list[QueueEntry])
def grading_queue(assignment_id: str, section: str | None = None, mine: bool = False):
    """The grading queue, optionally filtered to one course section or to the caller's own claims."""
    raise HTTPException(500, "...")


@router.post("/questions/{qid}/claim", response_model=QueueEntry)
def claim(assignment_id: str, qid: str, student_uid: str):
    """A TA claims one question"""
    raise HTTPException(500, "...")


@router.post("/questions/{qid}/release", response_model=QueueEntry)
def release(assignment_id: str, qid: str, student_uid: str):
    """Give up an assigned question"""
    raise HTTPException(500, "...")


@router.post("/reassign", response_model=QueueEntry)
def reassign(assignment_id: str, body: ReassignIn):
    """Instructor-only: move a (student, question) pair to a different grader, or unassign it."""
    raise HTTPException(500, "...")


@router.get("/submissions/{student_uid}/questions/{qid}", response_model=Decision | None)
def get_decision(assignment_id: str, student_uid: str, qid: str):
    """Current decision for one answer, or null if it hasn't been graded yet."""
    raise HTTPException(500, "...")


@router.put("/submissions/{student_uid}/questions/{qid}/decision", response_model=Decision)
def submit_decision(assignment_id: str, student_uid: str, qid: str, body: DecisionIn):
    """Create or update the grading decision for one answer.

    Marks the mapping "finished", recomputes the question score from the applied
    criteria, and appends an entry to the audit trail (S7.7).
    """
    raise HTTPException(500, "...")


@router.get("/regrade-queues", response_model=list[RegradeQueue])
def regrade_queues(assignment_id: str, qid: str | None = None):
    raise HTTPException(500, "...")


@router.post("/regrade-queues/{queue_id}/students/{student_uid}/resolve", response_model=Decision)
def resolve_regrade(assignment_id: str, queue_id: str, student_uid: str, body: DecisionIn):
    """Re-grade one answer caught by a regrade queue and remove it from that queue."""
    raise HTTPException(500, "...")
