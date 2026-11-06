import json
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from typing import Annotated

from app import assignments, config, cover_templates, rosters, status, store
from app.routing.auth import current_user
from app.processing import TEMPLATE_DIR, match_upload, process_upload
from app.services.page_crop import save_crop

def _fail_interrupted(db: dict) -> None:
    for assignment in db["assignments"]:
        for upload in assignment["uploads"]:
            if upload.get("status") in ("uploaded", "processing"):
                upload.update(status="failed", error="Interrupted by a server restart; reprocess to retry")


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.update(_fail_interrupted)
    yield


router = APIRouter(dependencies=[Depends(current_user)])


def config_error(_, error: config.ConfigError):
    return JSONResponse({"detail": str(error)}, status_code=500)


def _find(db: dict, assignment_id: str) -> dict:
    """The upload-store entry for an assignment. Whether the assignment exists is checked by require_assignment."""
    return store.entry(db, assignment_id)


def require_assignment(request: Request, assignment_id: str, user: Annotated[str, Depends(current_user)]) -> dict:
    """The assignment (from the database) named in the URL, or 404."""
    return assignments.find(request.app.state.db, user, assignment_id)


AssignmentRecord = Annotated[dict, Depends(require_assignment)]
# Routes under /api/assignments/{assignment_id} list this so an unknown assignment is a 404.
CHECKED = [Depends(require_assignment)]


def _with_uploads(assignment: dict, db: dict) -> dict:
    stored = _find(db, assignment["id"])
    return {**assignment, "uploads": stored["uploads"], "statuses": stored["statuses"]}


def _find_upload(db: dict, assignment_id: str, upload_id: str) -> dict:
    upload = next((u for u in _find(db, assignment_id)["uploads"] if u["id"] == upload_id), None)
    if upload is None:
        raise HTTPException(404, "Upload not found")
    return upload


def _pdf(path, filename: str, download: bool) -> FileResponse:
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=filename,
        content_disposition_type="attachment" if download else "inline",
    )


@router.get("/api/course")
def get_course(request: Request, user: Annotated[str, Depends(current_user)]):
    """The user's first course with its assignments and their uploads. See /api/courses for all courses."""
    courses = assignments.user_courses(request.app.state.db, user)
    if not courses:
        return {"course": None, "assignments": []}
    course = courses[0]
    db = store.load()
    return {
        "course": {k: course[k] for k in ("course_id", "code", "term", "title", "instructor")},
        "assignments": [_with_uploads(a, db) for a in course["assignments"]],
    }


@router.get("/api/students")
def get_students(request: Request, user: Annotated[str, Depends(current_user)]):
    """Each student with a status per assignment.

    Status is one of submitted / grading / graded / missing, or null while it is
    not yet known (nothing uploaded, or exams not all assigned yet).
    """
    courses = assignments.user_courses(request.app.state.db, user)
    db = store.load()
    stored = [_with_uploads(a, db) for a in (courses[0]["assignments"] if courses else [])]
    students = rosters.students(request.app.state.db)
    per_assignment = {a["id"]: status.student_statuses(a, [s["uid"] for s in students]) for a in stored}
    return [{**s, "progress": {aid: statuses[s["uid"]] for aid, statuses in per_assignment.items()}} for s in students]


@router.get("/api/staff")
def get_staff(request: Request):
    return rosters.staff(request.app.state.db)


class StudentIn(BaseModel):
    uid: str
    name: str
    email: str | None = None


@router.post("/api/courses/{course_id}/roster", status_code=201)
def add_student(request: Request, course_id: int, body: StudentIn, actor: str = Depends(current_user)):
    """Instructors add a student by UID and name; adding a UID again updates the name and email."""
    uid, name, email = body.uid.strip(), body.name.strip(), (body.email or "").strip() or None
    if not (len(uid) == 9 and uid.isdigit()):
        raise HTTPException(422, "A UID is 9 digits")
    if not name:
        raise HTTPException(422, "Enter the student's name")
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=actor), db.transaction(), db.get_connection() as conn:
        staff = conn.execute(
            """SELECT s.role FROM course_staff cs JOIN staff s USING (directory_id)
               WHERE cs.course_id = %s AND cs.directory_id = %s""",
            (course_id, actor),
        ).fetchone()
        if staff is None:
            raise HTTPException(404, "Course not found")
        if staff["role"] != "instructor":
            raise HTTPException(403, "Only instructors can add students")
        student = conn.execute(
            """INSERT INTO student (uid, name, email) VALUES (%s, %s, %s)
               ON CONFLICT (uid) DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, student.email)
               RETURNING uid, name, directory_id, email""",
            (uid, name, email),
        ).fetchone()
        conn.execute("INSERT INTO enrollment (course_id, uid) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                     (course_id, uid))
    return student


@router.get("/api/assignments/{assignment_id}/roster", dependencies=CHECKED)
def assignment_roster(request: Request, assignment_id: str):
    """Every student with their status for this assignment and a link to their exam, if they have one."""
    assignment = _find(store.load(), assignment_id)
    students = rosters.students(request.app.state.db)
    statuses = status.student_statuses(assignment, [s["uid"] for s in students])
    assigned = status.assigned_submissions(assignment)
    return {
        "all_assigned": status.all_exams_assigned(assignment),
        "students": [{**s, "status": statuses[s["uid"]], "submission": assigned.get(s["uid"])} for s in students],
    }


@router.get("/api/assignments/{assignment_id}", dependencies=CHECKED)
def get_assignment(assignment: AssignmentRecord):
    # Scans can only be split once the exam has a cover template.
    return {**_with_uploads(assignment, store.load()), "cover_template": (TEMPLATE_DIR / f"{assignment['id']}.json").exists()}


SAVE_FILE_PATH = {
    "blank_exam": "UPDATE assignment SET blank_pdf = %s WHERE exam_id = %s",
    "answer_key": "UPDATE assignment SET answer_key_pdf = %s WHERE exam_id = %s",
}


@router.post("/api/assignments/{assignment_id}/templates", status_code=201)
async def upload_template(request: Request, assignment: AssignmentRecord, user: Annotated[str, Depends(current_user)],
                          file: UploadFile = File(...), kind: str = Form("blank_exam", alias="type")):
    """Save the exam's blank PDF, which also makes its cover template so scans can be split, or its answer key."""
    if kind not in SAVE_FILE_PATH:
        raise HTTPException(422, "type must be blank_exam or answer_key")
    max_bytes = config.load()["max_upload_mb"] * 1024 * 1024
    pdf = await file.read(max_bytes + 1)
    if len(pdf) > max_bytes:
        raise HTTPException(413, "PDF is too large")
    if not pdf.startswith(b"%PDF-"):
        raise HTTPException(422, "File is not a PDF")
    try:
        save = cover_templates.save_blank_exam if kind == "blank_exam" else cover_templates.save_answer_key
        path = save(assignment["id"], pdf)
    except ValueError as error:
        raise HTTPException(422, str(error))
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=user), db.transaction(), db.get_connection() as conn:
        conn.execute(SAVE_FILE_PATH[kind], (path, assignment["exam_id"]))
    return {"type": kind, "path": path, "cover_template": (TEMPLATE_DIR / f"{assignment['id']}.json").exists()}


def _split_and_match(assignment_id: str, upload_id: str, pool) -> None:
    """Split the PDF into exams, then match each exam to a student, so nobody has to start matching by hand."""
    process_upload(assignment_id, upload_id)
    upload = next((u for u in _find(store.load(), assignment_id)["uploads"] if u["id"] == upload_id), None)
    if upload and upload["status"] == "processed":
        match_upload(assignment_id, upload_id, pool)


@router.post("/api/assignments/{assignment_id}/uploads", status_code=201, dependencies=CHECKED)
async def upload_pdf(request: Request, assignment_id: str, background: BackgroundTasks, file: UploadFile = File(...)):
    _find(store.load(), assignment_id)
    max_bytes = config.load()["max_upload_mb"] * 1024 * 1024
    upload_id = uuid.uuid4().hex
    folder = store.UPLOAD_DIR / assignment_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{upload_id}.pdf"

    size = 0
    try:
        with path.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                if size == 0 and not chunk.startswith(b"%PDF-"):
                    raise HTTPException(422, "File is not a PDF")
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(413, "PDF is too large")
                out.write(chunk)
        if size == 0:
            raise HTTPException(422, "File is empty")
    except BaseException:
        path.unlink(missing_ok=True)
        raise

    record = {
        "id": upload_id,
        "filename": file.filename or "upload.pdf",
        "size_bytes": size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": "uploaded",  # uploaded -> processing -> processed | failed
        "error": None,
        "pages": [],
        "submissions": [],
        "matching": "idle",  # idle -> running -> done | failed (after the PDF is split)
        "matching_error": None,
    }
    store.update(lambda db: _find(db, assignment_id)["uploads"].append(record))
    background.add_task(_split_and_match, assignment_id, upload_id, request.app.state.db)
    return record


@router.post("/api/assignments/{assignment_id}/uploads/{upload_id}/process", status_code=202, dependencies=CHECKED)
def reprocess(request: Request, assignment_id: str, upload_id: str, background: BackgroundTasks):
    upload = _find_upload(store.load(), assignment_id, upload_id)
    if upload["status"] in ("uploaded", "processing"):
        raise HTTPException(409, "Already processing")
    store.update(lambda db: _find_upload(db, assignment_id, upload_id).update(status="uploaded", error=None))
    background.add_task(_split_and_match, assignment_id, upload_id, request.app.state.db)
    return {"status": "uploaded"}


@router.delete("/api/assignments/{assignment_id}/uploads/{upload_id}", status_code=204, dependencies=CHECKED)
def delete_upload(assignment_id: str, upload_id: str):
    """Remove an upload: its record, the master PDF, and every split PDF made from it."""
    upload = _find_upload(store.load(), assignment_id, upload_id)
    if upload["status"] in ("uploaded", "processing"):
        raise HTTPException(409, "Wait for processing to finish before deleting")
    store.update(lambda db: _find(db, assignment_id)["uploads"].remove(
        next(u for u in _find(db, assignment_id)["uploads"] if u["id"] == upload_id)))
    (store.UPLOAD_DIR / assignment_id / f"{upload_id}.pdf").unlink(missing_ok=True)
    shutil.rmtree(store.SUBMISSION_DIR / assignment_id / upload_id, ignore_errors=True)


@router.get("/api/assignments/{assignment_id}/uploads/{upload_id}/file", dependencies=CHECKED)
def download_master(assignment_id: str, upload_id: str, download: bool = False):
    upload = _find_upload(store.load(), assignment_id, upload_id)
    return _pdf(store.UPLOAD_DIR / assignment_id / f"{upload_id}.pdf", upload["filename"], download)


@router.get("/api/assignments/{assignment_id}/uploads/{upload_id}/submissions/{submission_id}/file", dependencies=CHECKED)
def download_submission(assignment_id: str, upload_id: str, submission_id: str, download: bool = False):
    upload = _find_upload(store.load(), assignment_id, upload_id)
    submission = next((s for s in upload["submissions"] if s["id"] == submission_id), None)
    if submission is None:
        raise HTTPException(404, "Submission not found")
    path = store.SUBMISSION_DIR / assignment_id / upload_id / submission["filename"]
    return _pdf(path, f"{assignment_id}_{submission['filename']}", download)


@router.post("/api/assignments/{assignment_id}/uploads/{upload_id}/match", status_code=202, dependencies=CHECKED)
def match_students(request: Request, assignment_id: str, upload_id: str, background: BackgroundTasks):
    upload = _find_upload(store.load(), assignment_id, upload_id)
    if upload["status"] != "processed":
        raise HTTPException(409, "Split the PDF before matching students")
    if upload.get("matching") in ("running", "done"):
        raise HTTPException(409, "Matching has already run for this upload")
    store.update(lambda db: _find_upload(db, assignment_id, upload_id).update(matching="running", matching_error=None))
    background.add_task(match_upload, assignment_id, upload_id, request.app.state.db)
    return {"matching": "running"}


class Assignment(BaseModel):
    student_uid: str


@router.post("/api/assignments/{assignment_id}/uploads/{upload_id}/submissions/{submission_id}/assign", dependencies=CHECKED)
def assign_student(request: Request, assignment_id: str, upload_id: str, submission_id: str, body: Assignment):
    """Manually assign an exam that matching could not place. Auto-matched exams are not editable."""
    if body.student_uid not in {s["uid"] for s in rosters.students(request.app.state.db)}:
        raise HTTPException(404, "Student not on the roster")

    def mutate(db):
        assignment = _find(db, assignment_id)
        upload = _find_upload(db, assignment_id, upload_id)
        submission = next((s for s in upload["submissions"] if s["id"] == submission_id), None)
        if submission is None or upload.get("matching") != "done":
            raise HTTPException(404, "Exam not found or not matched yet")
        if submission["match"]["state"] == "matched":
            raise HTTPException(409, "This exam was matched automatically")
        taken = status.assigned_submissions(assignment).get(body.student_uid)
        if taken and (taken["upload_id"], taken["submission_id"]) != (upload_id, submission_id):
            raise HTTPException(409, "That student already has an exam assigned for this assignment")
        submission["match"] = {**submission["match"], "state": "assigned", "student_uid": body.student_uid}
        return submission

    return store.update(mutate)


@router.post("/api/assignments/{assignment_id}/uploads/{upload_id}/submissions/{submission_id}/unassign", dependencies=CHECKED)
def unassign_student(assignment_id: str, upload_id: str, submission_id: str):
    """Undo a match or assignment (automatic or manual); the exam goes back to waiting for a grader."""

    def mutate(db):
        assignment = _find(db, assignment_id)
        upload = _find_upload(db, assignment_id, upload_id)
        submission = next((s for s in upload["submissions"] if s["id"] == submission_id), None)
        if submission is None or upload.get("matching") != "done":
            raise HTTPException(404, "Exam not found or not matched yet")
        match = submission["match"]
        if match["state"] not in ("matched", "assigned"):
            raise HTTPException(409, "This exam is not assigned to a student")
        if assignment["statuses"].get(match["student_uid"]):
            raise HTTPException(409, "Grading has started for this student, so the exam cannot be unassigned")
        submission["match"] = {"state": "needs_review", "student_uid": None, "reason": "unassigned", "suggestion": None}
        return submission

    return store.update(mutate)


@router.get("/api/assignments/{assignment_id}/uploads/{upload_id}/submissions/{submission_id}/uid-image", dependencies=CHECKED)
def uid_image(assignment_id: str, upload_id: str, submission_id: str):
    upload = _find_upload(store.load(), assignment_id, upload_id)
    submission = next((s for s in upload["submissions"] if s["id"] == submission_id and s.get("uid_image")), None)
    if submission is None:
        raise HTTPException(404, "No UID image")
    return FileResponse(store.SUBMISSION_DIR / assignment_id / upload_id / submission["uid_image"], media_type="image/png")


@router.get("/api/assignments/{assignment_id}/uploads/{upload_id}/submissions/{submission_id}/panel-image", dependencies=CHECKED)
def panel_image(assignment_id: str, upload_id: str, submission_id: str):
    """The whole identification area of the cover page (UID boxes, handwritten name and directory ID)."""
    upload = _find_upload(store.load(), assignment_id, upload_id)
    submission = next((s for s in upload["submissions"] if s["id"] == submission_id), None)
    template = TEMPLATE_DIR / f"{assignment_id}.json"
    if submission is None or not template.exists():
        raise HTTPException(404, "Exam or template not found")
    region = json.loads(template.read_text()).get("id_panel")
    if region is None:
        raise HTTPException(404, "Template has no id_panel region")
    folder = store.SUBMISSION_DIR / assignment_id / upload_id
    out = folder / f"{submission_id}_panel.png"
    if not out.exists():  # made on first request, so exams matched earlier work too
        save_crop(folder / submission["filename"], tuple(region), out)
    return FileResponse(out, media_type="image/png")

