"""Assignment and student status: the stored workflow, and the one function that moves an assignment through it.

assignment.status:          draft -> collecting -> grading -> in_review -> closed
assignment_student.status:  missing / needs_review / matched / excused / no_show (graded is derived from mapping)

Every function here takes a connection whose transaction the caller owns, and locks the assignment row first,
the same lock GradingService.access takes, so status checks and grade saves never interleave.
"""


from fastapi import HTTPException

from app import status as scans, store
from app.database import exam as exam_db
from app.database import studentpaper as studentpaper_db
from app.database import workflow as workflow_db

STATUSES = ("draft", "collecting", "grading", "in_review", "closed")
# Forward moves (one step at a time) and who may make them. Moving back is instructor-only and needs confirm.
FORWARD = {
    ("draft", "collecting"): {"instructor"},
    ("collecting", "grading"): {"instructor", "ta"},
    ("grading", "in_review"): {"instructor", "ta"},
    ("in_review", "closed"): {"instructor"},
}
STUDENT_STATUSES = ("missing", "needs_review", "matched", "excused", "no_show")
RESOLVED = ("matched", "excused", "no_show")
# Every status but closed: the rubric's criteria can still change.
OPEN = STATUSES[:-1]
# Statuses a TA or instructor sets by hand; the rest come from matching.
MARKS = ("excused", "no_show")


def _lock(conn, exam_id: int, actor: str | None = None) -> dict:
    """Lock the assignment and return its status and slug, plus the actor's role when an actor is given (else 403)."""
    if actor is None:
        row = exam_db.lock_assignment(conn, exam_id)
        if row is None:
            raise HTTPException(404, "Assignment not found")
        return {**row, "role": None}
    row = exam_db.lock_assignment_for_staff(conn, exam_id, actor)
    if row is None:
        raise HTTPException(403, "Not a member of this course")
    return row


def require(conn, exam_id: int, allowed: tuple[str, ...], action: str) -> str:
    """409 unless the assignment's status is one of `allowed`. Returns the status."""
    current = _lock(conn, exam_id)["status"]
    if current not in allowed:
        raise HTTPException(409, f"{action} is not allowed while the assignment is {current.replace('_', ' ')}")
    return current


def seed_students(conn, exam_id: int) -> None:
    """A 'missing' row for every enrolled student who has none yet. Safe to run again (roster uploads, reopening)."""
    workflow_db.seed_assignment_students(conn, exam_id)


def seed_course(conn, course_id: int) -> None:
    """seed_students for every assignment in the course that is past draft (after a roster change)."""
    for row in exam_db.lock_course_assignments(conn, course_id):
        seed_students(conn, row["exam_id"])


def _waiting_scans(entry: dict) -> int:
    """Split scans in the upload store not yet matched or assigned to a student."""
    return sum(
        1
        for upload in entry["uploads"] if upload["status"] == "processed"
        for submission in upload.get("submissions", [])
        if (submission.get("match") or {}).get("state") not in scans.RESOLVED
    )


def sync_from_store(conn, exam_id: int, actor: str | None = None, *, prune: bool = False) -> None:
    """Copy matching from the upload store (data/db.json) into assignment_student.

    With `prune`, after a TA removes scans, papers copied into SQL for students who no longer have a scan are deleted
    (with their mapping rows) unless they hold a saved grade, so those students leave grading queues.

    A student with a matched scan (or a paper already in SQL) is matched, even if they were excused or marked a
    no-show: the scan is the makeup, or proof they sat it. Otherwise excused and no_show stay; everyone else is
    needs_review when an unconfirmed scan suggests them, or missing.
    """
    row = _lock(conn, exam_id)
    if row["status"] == "draft":
        return
    seed_students(conn, exam_id)
    entry = store.entry(store.load(), row["slug"])
    matched = list(scans.assigned_submissions(entry))
    suggested = [
        submission["match"]["suggestion"]
        for upload in entry["uploads"]
        for submission in upload.get("submissions", [])
        if (submission.get("match") or {}).get("state") == "needs_review" and submission["match"].get("suggestion")
    ]
    if prune:
        studentpaper_db.prune_ungraded_papers(conn, exam_id, matched)
    workflow_db.sync_student_statuses(conn, actor, matched, suggested, exam_id)


def _setup_problems(conn, exam_id: int, slug: str) -> list[str]:
    row = workflow_db.setup_readiness(conn, exam_id)
    problems = []
    if not row["blank"]:
        problems.append("Upload the blank exam")
    if not row["region"]:
        problems.append("Draw a region for at least one question")
    if not (row["questions"] and row["criteria"]):
        problems.append("Every question needs at least one rubric criterion")
    return problems


def _count(conn, exam_id: int, readiness: str) -> int:
    """Enrolled students of the assignment matching the named readiness check."""
    return workflow_db.count_students(conn, exam_id, readiness)


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def _collect_problems(conn, exam_id: int, slug: str) -> list[str]:
    problems = []
    if unresolved := _count(conn, exam_id, "unresolved"):
        problems.append(_plural(unresolved, "student is", "students are") + " missing or need review")
    if waiting := _waiting_scans(store.entry(store.load(), slug)):
        problems.append(_plural(waiting, "scan is", "scans are") + " waiting to be matched")
    return problems


def _grading_problems(conn, exam_id: int, slug: str) -> list[str]:
    ungraded = _count(conn, exam_id, "ungraded")
    return [_plural(ungraded, "student is", "students are") + " not fully graded"] if ungraded else []


def _review_problems(conn, exam_id: int, slug: str) -> list[str]:
    ungraded = _count(conn, exam_id, "without_grade")
    return [_plural(ungraded, "student has", "students have") + " no grade (missing, excused or ungraded)"] if ungraded else []


# What must be true to move forward into each status.
CHECKS = {
    "collecting": _setup_problems,
    "grading": _collect_problems,
    "in_review": _grading_problems,
    "closed": _review_problems,
}


def change_status(conn, exam_id: int, target: str, actor: str, *, confirm: bool = False) -> str:
    """Move an assignment to `target`, checking the rules under the assignment lock. The caller owns the transaction."""
    if target not in STATUSES:
        raise HTTPException(422, f"Unknown status {target}")
    row = _lock(conn, exam_id, actor)
    current, role = row["status"], row["role"]
    if target == current:
        return current
    if STATUSES.index(target) < STATUSES.index(current):
        if role != "instructor":
            raise HTTPException(403, "Only instructors can move an assignment back")
        if not confirm:
            raise HTTPException(409, {"message": f"Move back from {current} to {target}?", "confirm_required": True})
    else:
        allowed = FORWARD.get((current, target))
        if allowed is None:
            raise HTTPException(409, f"Can't go from {current} to {target} in one step")
        if role not in allowed:
            raise HTTPException(403, f"Only {' or '.join(sorted(allowed))}s can move to {target}")
        if target != "collecting":
            # Pick up roster changes and matches the last sync missed before checking students.
            sync_from_store(conn, exam_id, actor)
        problems = CHECKS[target](conn, exam_id, row["slug"])
        if problems:
            raise HTTPException(409, {"message": f"Not ready for {target.replace('_', ' ')}", "problems": problems})
    workflow_db.set_assignment_status(conn, target, exam_id)
    seed_students(conn, exam_id)
    return target


def mark_student(conn, exam_id: int, uid: str, mark: str | None, actor: str, note: str | None = None) -> dict:
    """Mark a student excused or no_show, or undo it (mark=None). TAs and instructors, while the assignment is open."""
    if mark is not None and mark not in MARKS:
        raise HTTPException(422, "Status must be excused, no_show or null")
    current = _lock(conn, exam_id, actor)["status"]
    if current not in ("collecting", "grading", "in_review"):
        raise HTTPException(409, f"Students can't be excused or marked absent while the assignment is {current.replace('_', ' ')}")
    row = workflow_db.lock_student_status(conn, exam_id, uid)
    if row is None:
        raise HTTPException(404, "Student is not on this assignment's roster")
    if mark is not None:
        if row["status"] == "matched":
            raise HTTPException(409, "This student has a matched exam; unassign it first")
        workflow_db.set_student_mark(conn, mark, actor, note, exam_id, uid)
    elif row["status"] in MARKS:
        # Undo: back to missing, then let the sync decide whether a scan says otherwise.
        workflow_db.clear_student_mark(conn, actor, exam_id, uid)
        sync_from_store(conn, exam_id, actor)
    return student(conn, exam_id, uid)


def student(conn, exam_id: int, uid: str) -> dict:
    """One student's row from assignment_student_progress, shaped for the API."""
    row = workflow_db.student_progress(conn, exam_id, uid)
    return _shape(row)


def students(conn, exam_id: int) -> dict[str, dict]:
    """uid -> status and progress for every student with a row on this assignment."""
    rows = workflow_db.students_progress(conn, exam_id)
    return {r["uid"]: _shape(r) for r in rows}


def _shape(row: dict) -> dict:
    return {
        "uid": row["uid"],
        "status": row["status"],
        "graded": row["graded"],
        "questions": row["questions"],
        "finished": row["finished"],
        "set_by": row["set_by"],
        "set_at": row["set_at"].isoformat() if row["set_at"] else None,
        "note": row["note"],
    }


def progress(conn, exam_ids: list[int]) -> dict[int, dict]:
    """exam_id -> grading progress over enrolled students: graded, total, and per-status counts."""
    rows = workflow_db.assignment_progress(conn, exam_ids)
    result = {exam_id: {"graded": 0, "total": 0, "students": {}} for exam_id in exam_ids}
    for r in rows:
        found = result[r["exam_id"]]
        found["students"][r["status"]] = r["n"]
        found["total"] += r["n"]
        found["graded"] += r["graded"]
    return result


def sync_all(database) -> None:
    """At startup: sync every assignment past draft from the upload store, catching up on missed or failed syncs."""
    with database.transaction(), database.get_connection() as conn:
        for row in exam_db.active_assignments(conn):
            sync_from_store(conn, row["exam_id"])
