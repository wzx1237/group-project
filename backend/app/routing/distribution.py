import csv
import io
import json
import shutil
import uuid
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from typing import Annotated

from app import assignments, config, cover_templates, rosters, status, store, workflow
from app.routing.auth import current_user
from app.processing import TEMPLATE_DIR, match_upload, process_upload
from app.services.page_crop import save_crop

def _fail_interrupted(db: dict) -> None:
    assignments_list = db.get("assignments", []) if isinstance(db, dict) else []
    for assignment in assignments_list:
        for upload in assignment.get("uploads", []):
            if upload.get("status") in ("uploaded", "processing"):
                upload.update(status="failed", error="Interrupted by a server restart; reprocess to retry")


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.update(_fail_interrupted)
    if app.state.grading_db is not None:
        # Catch up on any student-status sync that failed or was cut short (see workflow.sync_from_store).
        workflow.sync_all(app.state.grading_db)
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
    return {**assignment, "uploads": _find(db, assignment["id"])["uploads"]}


@contextmanager
def _changing_scans(request: Request, assignment: dict, action: str, actor: str | None):
    """Run a change to the assignment's scans under its lock, only while collecting, then sync student status.

    The upload store is written inside the block and committed first, so if the SQL sync fails the two disagree
    until the next sync; see DATABASE_OVERVIEW.md, part 3.
    """
    database = getattr(request.app.state, "grading_db", None)
    if database is None:  # no PostgreSQL (unit tests)
        yield None
        return
    with database.audit_context(actor_ID=actor), database.transaction(), database.get_connection() as conn:
        workflow.require(conn, assignment["exam_id"], ("collecting",), action)
        yield conn
        workflow.sync_from_store(conn, assignment["exam_id"], actor, prune=True)


def _sync(database, exam_id: int) -> None:
    """Sync student status after background matching; its own short transaction."""
    if database is not None:
        with database.transaction(), database.get_connection() as conn:
            workflow.sync_from_store(conn, exam_id)


def _statuses(request: Request, exam_ids: list[int]) -> dict[int, dict[str, dict]]:
    """exam_id -> uid -> stored status and grading progress. Empty for an assignment still in draft."""
    database = getattr(request.app.state, "grading_db", None)
    if database is None:
        return {exam_id: {} for exam_id in exam_ids}
    with database.get_connection() as conn:
        return {exam_id: workflow.students(conn, exam_id) for exam_id in exam_ids}


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
    """Each student with their status per assignment: {status, graded, ...} from assignment_student, or null
    while the assignment is still in draft."""
    courses = assignments.user_courses(request.app.state.db, user)
    if not courses:
        return []
    found = courses[0]["assignments"]
    per_assignment = _statuses(request, [a["exam_id"] for a in found])
    students = rosters.students(request.app.state.db, course_id=courses[0]["course_id"])
    return [{**s, "progress": {a["id"]: per_assignment[a["exam_id"]].get(s["uid"]) for a in found}} for s in students]


@router.get("/api/staff")
def get_staff(request: Request, user: Annotated[str, Depends(current_user)]):
    """The staff of the user's first course, like /api/course. /api/courses/{course_id}/staff names the course."""
    courses = assignments.user_courses(request.app.state.db, user)
    return rosters.staff(request.app.state.db, course_id=courses[0]["course_id"]) if courses else []


class StudentIn(BaseModel):
    uid: str
    name: str
    email: str | None = None
    section: str | None = None


class StudentsIn(BaseModel):
    students: list[StudentIn]


def _resolve_course_id(conn, course_id: int | str) -> int:
    cid = None
    if isinstance(course_id, int) or (isinstance(course_id, str) and course_id.isdigit()):
        cid = int(course_id)
        row = conn.execute("SELECT course_id FROM course WHERE course_id = %s", (cid,)).fetchone()
        if row:
            return row["course_id"]
    row = conn.execute("SELECT course_id FROM course WHERE lower(code) = lower(%s)", (str(course_id),)).fetchone()
    if row:
        return row["course_id"]
    if cid is not None:
        return cid
    raise HTTPException(404, "Course not found")


def _add_students_to_course(conn, course_id: int, students: list[dict]) -> list[dict]:
    has_section = True
    try:
        conn.execute("SAVEPOINT check_sec")
        conn.execute("SELECT section FROM enrollment LIMIT 0")
        conn.execute("RELEASE SAVEPOINT check_sec")
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT check_sec")
        has_section = False

    saved = []
    for s in students:
        uid = str(s.get("uid") or "").strip()
        name = str(s.get("name") or "").strip()
        email = (s.get("email") or "").strip() or None
        section = (s.get("section") or "").strip() or None

        if not (len(uid) == 9 and uid.isdigit()):
            raise HTTPException(422, "A UID is 9 digits")
        if not name:
            raise HTTPException(422, "Enter the student's name")

        student = conn.execute(
            """INSERT INTO student (uid, name, email) VALUES (%s, %s, %s)
               ON CONFLICT (uid) DO UPDATE SET
                 name = EXCLUDED.name,
                 email = COALESCE(EXCLUDED.email, student.email)
               RETURNING uid, name, directory_id, email""",
            (uid, name, email),
        ).fetchone()

        if has_section and section:
            conn.execute(
                """INSERT INTO enrollment (course_id, uid, section) VALUES (%s, %s, %s)
                   ON CONFLICT (course_id, uid) DO UPDATE SET
                     section = COALESCE(EXCLUDED.section, enrollment.section)""",
                (course_id, uid, section),
            )
        else:
            conn.execute(
                "INSERT INTO enrollment (course_id, uid) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (course_id, uid),
            )
        saved.append({**student, "section": section})
    return saved


@router.get("/api/courses/{course_id}/roster")
def get_course_roster(request: Request, course_id: int | str, user: Annotated[str, Depends(current_user)]):
    """Enrolled students for a specific course offering."""
    db = request.app.state.grading_db
    with db.get_connection() as conn:
        cid = _resolve_course_id(conn, course_id)
        if not assignments.is_member(conn, cid, user):
            raise HTTPException(403, "Not a member of this course")
        return rosters.students(request.app.state.db, course_id=cid)


@router.get("/api/courses/{course_id}/staff")
def get_course_staff(request: Request, course_id: int | str, user: Annotated[str, Depends(current_user)]):
    """Instructors and TAs of a specific course offering."""
    db = request.app.state.grading_db
    with db.get_connection() as conn:
        cid = _resolve_course_id(conn, course_id)
        if not assignments.is_member(conn, cid, user):
            raise HTTPException(403, "Not a member of this course")
    return rosters.staff(request.app.state.db, course_id=cid)


@router.post("/api/courses/{course_id}/roster", status_code=201)
def add_student(
    request: Request,
    course_id: int | str,
    body: StudentIn | list[StudentIn] | StudentsIn,
    actor: str = Depends(current_user),
):
    """Instructors add one or multiple students by UID and name; adding a UID again updates the name and email."""
    if isinstance(body, StudentsIn):
        student_list = body.students
        single = False
    elif isinstance(body, list):
        student_list = body
        single = False
    else:
        student_list = [body]
        single = True

    if not student_list:
        raise HTTPException(422, "No student data provided")

    for s in student_list:
        uid = s.uid.strip()
        name = s.name.strip()
        if not (len(uid) == 9 and uid.isdigit()):
            raise HTTPException(422, "A UID is 9 digits")
        if not name:
            raise HTTPException(422, "Enter the student's name")

    db = request.app.state.grading_db
    with db.audit_context(actor_ID=actor), db.transaction(), db.get_connection() as conn:
        cid = _resolve_course_id(conn, course_id)
        staff = conn.execute(
            """SELECT s.role FROM course_staff cs JOIN staff s USING (directory_id)
               WHERE cs.course_id = %s AND cs.directory_id = %s""",
            (cid, actor),
        ).fetchone()
        if staff is None:
            raise HTTPException(404, "Course not found")
        if staff["role"] != "instructor":
            raise HTTPException(403, "Only instructors can add students")

        saved = _add_students_to_course(conn, cid, [s.model_dump() for s in student_list])
        workflow.seed_course(conn, cid)

    return saved[0] if single else saved


@router.post("/api/courses/{course_id}/roster/upload", status_code=201)
async def upload_roster_csv(
    request: Request,
    course_id: int | str,
    file: UploadFile = File(...),
    actor: str = Depends(current_user),
):
    """Instructors upload a CSV file with student roster (UID, Name, Email, Section)."""
    db = request.app.state.grading_db
    with db.audit_context(actor_ID=actor), db.transaction(), db.get_connection() as conn:
        cid = _resolve_course_id(conn, course_id)
        staff = conn.execute(
            """SELECT s.role FROM course_staff cs JOIN staff s USING (directory_id)
               WHERE cs.course_id = %s AND cs.directory_id = %s""",
            (cid, actor),
        ).fetchone()
        if staff is None:
            raise HTTPException(404, "Course not found")
        if staff["role"] != "instructor":
            raise HTTPException(403, "Only instructors can upload roster")

        content = await file.read()
        if not content or not content.strip():
            raise HTTPException(422, "Uploaded CSV file is empty")

        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = content.decode("latin1")
            except Exception:
                raise HTTPException(422, "Unable to read CSV file encoding")

        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise HTTPException(422, "CSV file has no headers")

        def get_val(row_dict, *aliases):
            normalized = {
                k.strip().lower().replace("_", "").replace(" ", "").replace("-", ""): v
                for k, v in row_dict.items()
                if k
            }
            for a in aliases:
                clean = a.strip().lower().replace("_", "").replace(" ", "").replace("-", "")
                if clean in normalized and normalized[clean] is not None:
                    val = str(normalized[clean]).strip()
                    if val:
                        return val
            return None

        students_to_add = []
        for idx, row in enumerate(reader, start=2):
            if not any(v and str(v).strip() for v in row.values() if v is not None):
                continue
            uid = get_val(row, "uid", "studentuid", "studentid", "id")
            name = get_val(row, "name", "studentname", "fullname")
            email = get_val(row, "email", "universityemail", "mail")
            section = get_val(row, "section", "discussionsection", "sec")

            if not uid:
                raise HTTPException(422, f"Row {idx} is missing UID")
            if not (len(uid) == 9 and uid.isdigit()):
                raise HTTPException(422, f"A UID is 9 digits (found '{uid}' on line {idx})")
            if not name:
                raise HTTPException(422, f"Enter the student's name on line {idx}")

            students_to_add.append({
                "uid": uid,
                "name": name,
                "email": email or None,
                "section": section or None,
            })

        if not students_to_add:
            raise HTTPException(422, "No students found in CSV file")

        saved = _add_students_to_course(conn, cid, students_to_add)
        workflow.seed_course(conn, cid)

    return {"uploaded": len(saved), "students": saved}


@router.get("/api/assignments/{assignment_id}/roster")
def assignment_roster(request: Request, assignment: AssignmentRecord):
    """Every student with their stored status for this assignment (null in draft), grading progress,
    and a link to their exam, if they have one."""
    stored = _find(store.load(), assignment["id"])
    statuses = _statuses(request, [assignment["exam_id"]])[assignment["exam_id"]]
    assigned = status.assigned_submissions(stored)
    students = rosters.students(request.app.state.db, course_id=assignment["course_id"])
    return {
        "assignment_status": assignment.get("status"),
        "students": [
            {**s, "status": (statuses.get(s["uid"]) or {}).get("status"), "progress": statuses.get(s["uid"]),
             "submission": assigned.get(s["uid"])}
            for s in students
        ],
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
    db = request.app.state.grading_db
    with db.transaction(), db.get_connection() as conn:
        if not assignments.is_instructor(conn, user):
            raise HTTPException(403, "Only instructors can upload exam templates")
        # The blank exam fixes where answers sit on every scan; the answer key can change any time before closing.
        workflow.require(conn, assignment["exam_id"], ("draft",) if kind == "blank_exam" else workflow.OPEN,
                         "Replacing the blank exam" if kind == "blank_exam" else "Replacing the answer key")
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
    with db.audit_context(actor_ID=user), db.transaction(), db.get_connection() as conn:
        conn.execute(SAVE_FILE_PATH[kind], (path, assignment["exam_id"]))
    return {"type": kind, "path": path, "cover_template": (TEMPLATE_DIR / f"{assignment['id']}.json").exists()}


@router.get("/api/assignments/{assignment_id}/templates/blank_exam")
def get_blank_exam(assignment: AssignmentRecord):
    """The saved blank exam PDF, which the setup page draws question regions on."""
    path = TEMPLATE_DIR / f"{assignment['id']}.pdf"
    if not path.is_file():
        raise HTTPException(404, "This assignment has no blank exam yet")
    return FileResponse(path, media_type="application/pdf")


def _split_and_match(assignment: dict, upload_id: str, pool, database) -> None:
    """Split the PDF into exams, then match each exam to a student, so nobody has to start matching by hand."""
    process_upload(assignment["id"], upload_id)
    upload = next((u for u in _find(store.load(), assignment["id"])["uploads"] if u["id"] == upload_id), None)
    if upload and upload["status"] == "processed":
        _match_and_sync(assignment, upload_id, pool, database)


def _match_and_sync(assignment: dict, upload_id: str, pool, database) -> None:
    match_upload(assignment["id"], upload_id, pool, assignment["course_id"])
    _sync(database, assignment["exam_id"])


@router.post("/api/assignments/{assignment_id}/uploads", status_code=201)
async def upload_pdf(request: Request, assignment: AssignmentRecord, background: BackgroundTasks, file: UploadFile = File(...)):
    assignment_id = assignment["id"]
    # Checked (and released) before the PDF streams in, so a long upload never holds the assignment lock.
    with _changing_scans(request, assignment, "Uploading scans", None):
        pass
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
    background.add_task(_split_and_match, assignment, upload_id, request.app.state.db, getattr(request.app.state, "grading_db", None))
    return record


@router.post("/api/assignments/{assignment_id}/uploads/{upload_id}/process", status_code=202)
def reprocess(request: Request, assignment: AssignmentRecord, upload_id: str, background: BackgroundTasks,
              user: Annotated[str, Depends(current_user)]):
    assignment_id = assignment["id"]
    with _changing_scans(request, assignment, "Reprocessing scans", user) as conn:
        upload = _find_upload(store.load(), assignment_id, upload_id)
        if upload["status"] in ("uploaded", "processing"):
            raise HTTPException(409, "Already processing")
        _refuse_if_graded(conn, assignment, _students_in(upload))
        # Its old exams are replaced, so their students go back to missing until matching runs again.
        store.update(lambda db: _find_upload(db, assignment_id, upload_id).update(status="uploaded", error=None, submissions=[]))
    background.add_task(_split_and_match, assignment, upload_id, request.app.state.db, getattr(request.app.state, "grading_db", None))
    return {"status": "uploaded"}


@router.delete("/api/assignments/{assignment_id}/uploads/{upload_id}", status_code=204)
def delete_upload(request: Request, assignment: AssignmentRecord, upload_id: str, user: Annotated[str, Depends(current_user)]):
    """Remove an upload: its record, the master PDF, and every split PDF made from it."""
    assignment_id = assignment["id"]
    with _changing_scans(request, assignment, "Deleting scans", user) as conn:
        upload = _find_upload(store.load(), assignment_id, upload_id)
        if upload["status"] in ("uploaded", "processing"):
            raise HTTPException(409, "Wait for processing to finish before deleting")
        _refuse_if_graded(conn, assignment, _students_in(upload))
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


@router.post("/api/assignments/{assignment_id}/uploads/{upload_id}/match", status_code=202)
def match_students(request: Request, assignment: AssignmentRecord, upload_id: str, background: BackgroundTasks,
                   user: Annotated[str, Depends(current_user)]):
    assignment_id = assignment["id"]
    with _changing_scans(request, assignment, "Matching scans", user):
        upload = _find_upload(store.load(), assignment_id, upload_id)
        if upload["status"] != "processed":
            raise HTTPException(409, "Split the PDF before matching students")
        if upload.get("matching") in ("running", "done"):
            raise HTTPException(409, "Matching has already run for this upload")
        store.update(lambda db: _find_upload(db, assignment_id, upload_id).update(matching="running", matching_error=None))
    background.add_task(_match_and_sync, assignment, upload_id, request.app.state.db, getattr(request.app.state, "grading_db", None))
    return {"matching": "running"}


def _students_in(upload: dict) -> list[str]:
    """Students with an exam matched or assigned from this upload."""
    return [s["match"]["student_uid"] for s in upload.get("submissions", [])
            if (s.get("match") or {}).get("state") in status.RESOLVED]


def _refuse_if_graded(conn, assignment: dict, uids: list[str]) -> None:
    """409 if any of these students already has a saved grade on this assignment: their scan has to stay."""
    if conn is not None and conn.execute(
        "SELECT 1 FROM decision WHERE exam_id = %s AND uid = ANY(%s) LIMIT 1", (assignment["exam_id"], uids)
    ).fetchone():
        raise HTTPException(409, "Grading has started for this student, so the exam cannot be unassigned")


class Assignment(BaseModel):
    student_uid: str


@router.post("/api/assignments/{assignment_id}/uploads/{upload_id}/submissions/{submission_id}/assign")
def assign_student(request: Request, assignment: AssignmentRecord, upload_id: str, submission_id: str, body: Assignment,
                   user: Annotated[str, Depends(current_user)]):
    """Manually assign an exam that matching could not place. Auto-matched exams are not editable.

    Assigning an excused student's makeup, or a scan for someone marked a no-show, makes them matched."""
    assignment_id = assignment["id"]
    if body.student_uid not in {s["uid"] for s in rosters.students(request.app.state.db, course_id=assignment["course_id"])}:
        raise HTTPException(404, "Student not on this course's roster")

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

    with _changing_scans(request, assignment, "Assigning scans", user):
        return store.update(mutate)


@router.post("/api/assignments/{assignment_id}/uploads/{upload_id}/submissions/{submission_id}/unassign")
def unassign_student(request: Request, assignment: AssignmentRecord, upload_id: str, submission_id: str,
                     user: Annotated[str, Depends(current_user)]):
    """Undo a match or assignment (automatic or manual); the exam goes back to waiting for a TA.

    Refused once the student has a saved grade. Otherwise the sync drops their copied paper, so they leave grading queues."""
    assignment_id = assignment["id"]

    def mutate(db):
        upload = _find_upload(db, assignment_id, upload_id)
        submission = next((s for s in upload["submissions"] if s["id"] == submission_id), None)
        if submission is None or upload.get("matching") != "done":
            raise HTTPException(404, "Exam not found or not matched yet")
        match = submission["match"]
        if match["state"] not in ("matched", "assigned"):
            raise HTTPException(409, "This exam is not assigned to a student")
        _refuse_if_graded(conn, assignment, [match["student_uid"]])
        submission["match"] = {"state": "needs_review", "student_uid": None, "reason": "unassigned", "suggestion": None}
        return submission

    with _changing_scans(request, assignment, "Unassigning scans", user) as conn:
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

