
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app.routing.auth import current_user

router = APIRouter(prefix="/api/assignments/{assignment_id}/rubric", dependencies=[Depends(current_user)])

GradingMethod = Literal["manual", "auto_numeric", "auto_match"]


class Criterion(BaseModel):
    """One reusable grading criterion ("Label" in the data model)."""

    label_id: str
    title: str  
    description: str = ""  # grader-only detail not shown to students
    deduction: float = 0.0  # negative = deduction positive = credit


class CriterionIn(BaseModel):
    title: str
    description: str = ""
    deduction: float = 0.0


class Question(BaseModel):
    """One rubric question (a "Rubric" row plus its linked "Label"s)."""

    qid: str
    grading_method: GradingMethod
    total_score: float
    criteria: list[Criterion] = []


class QuestionIn(BaseModel):
    qid: str
    grading_method: GradingMethod = "manual"
    total_score: float


class RubricOut(BaseModel):
    assignment_id: str
    version: int
    questions: list[Question]


class CopyRubricIn(BaseModel):
    from_assignment_id: str


class ImportRubricIn(BaseModel):
    markdown: str


@router.get("", response_model=RubricOut)
def get_rubric(assignment_id: str):
    """Full rubric for this exam: every question and its criteria, newest version only."""
    raise HTTPException(500, "...")


@router.post("/questions", response_model=Question, status_code=201)
def add_question(assignment_id: str, body: QuestionIn):
    raise HTTPException(500, "...")


@router.patch("/questions/{qid}", response_model=Question)
def update_question(assignment_id: str, qid: str, body: QuestionIn):
    raise HTTPException(500, "...")


@router.delete("/questions/{qid}", status_code=204)
def retire_question(assignment_id: str, qid: str):
    raise HTTPException(500, "...")


@router.post("/questions/{qid}/criteria", response_model=Criterion, status_code=201)
def add_criterion(assignment_id: str, qid: str, body: CriterionIn):
    raise HTTPException(500, "...")


@router.patch("/criteria/{label_id}", response_model=Criterion)
def update_criterion(assignment_id: str, label_id: str, body: CriterionIn):
    """Edit a criterion's points or wording."""
    raise HTTPException(500, "...")


@router.delete("/criteria/{label_id}", status_code=204)
def retire_criterion(assignment_id: str, label_id: str):
    raise HTTPException(500, "...")


@router.post("/questions/{qid}/criteria/{label_id}/split", status_code=202)
def split_criterion(assignment_id: str, qid: str, label_id: str, replacements: list[CriterionIn]):
    raise HTTPException(500, "...")





