# Database API reference

Current signatures after the workspace_11_4 persistence refactor. Read [README.md](README.md) for transactions, row shapes, scoring and retired APIs. All module functions accept the caller connection and never commit.

## Connection-based functions

### `course`

| Signature | Purpose |
| --- | --- |
| `courses_for_staff(conn, directory_id) -> list[dict]` | Courses for staff; return rows in query order. |
| `course_code(conn, course_id) -> dict \| None` | Course code; return None when missing. |
| `create_course(conn, code, term, title) -> dict \| None` | Create course; return None when missing. |
| `course_row(conn, course_id) -> dict \| None` | Course row; return None when missing. |
| `update_course_columns(conn, course_id: int, changes: dict) -> int` | Update course metadata using an explicit column whitelist. |
| `course_id_row(conn, course_id) -> dict \| None` | Course id row; return None when missing. |
| `course_by_code(conn, code) -> dict \| None` | Course by code; return None when missing. |
| `ensure_course(conn, code, term) -> int` | Ensure course; return the affected row count. |
| `course_id_by_term(conn, code, term) -> dict \| None` | Course id by term; return None when missing. |

### `decision`

| Signature | Purpose |
| --- | --- |
| `enrolled_decisions(conn, exam_id, uid) -> list[dict]` | Enrolled decisions; return rows in query order. |
| `set_internal_note(conn, internal_note, exam_id, uid, qid) -> int` | Set internal note; return the affected row count. |
| `has_saved_decisions(conn, exam_id, uids) -> dict \| None` | Has saved decisions; return None when missing. |

### `exam`

| Signature | Purpose |
| --- | --- |
| `get_course_exams(conn, course_ids: list[int]) -> list[dict]` | All assignment fields for the courses, ordered by due date then exam ID. |
| `assignment_slugs(conn) -> list[dict]` | Assignment slugs; return rows in query order. |
| `create_assignment(conn, course_id, title, due, slug, kind, short) -> dict \| None` | Insert an assignment and return its API fields; duplicate slugs raise UniqueViolation. |
| `delete_assignment(conn, exam_id) -> int` | Delete assignment; return the affected row count. |
| `update_assignment_columns(conn, exam_id: int, changes: dict) -> int` | Update allowed assignment columns; omitted keys keep their current values. |
| `get_assignment(conn, exam_id) -> dict \| None` | Get assignment; return None when missing. |
| `lock_assignment(conn, exam_id) -> dict \| None` | Lock assignment; return None when missing. |
| `lock_assignment_for_staff(conn, exam_id, actor) -> dict \| None` | Lock the assignment and return status/slug/role, or None for a nonmember. |
| `lock_course_assignments(conn, course_id) -> list[dict]` | Lock course assignments; return rows in query order. |
| `active_assignments(conn) -> list[dict]` | Active assignments; return rows in query order. |
| `lock_exam(conn, exam_id) -> int` | Lock exam; return the affected row count. |
| `lock_assignment_by_slug(conn, assignment_id, actor) -> dict \| None` | Lock assignment by slug; return None when missing. |
| `release_status(conn, exam_id) -> dict \| None` | Release status; return None when missing. |
| `save_template_path(conn, kind, path, exam_id) -> int` | Save a blank-exam or answer-key reference using the fixed template-kind mapping. |
| `seed_assignment(conn, course_id, title, due, slug, kind, short) -> int` | Seed assignment; return the affected row count. |

### `grading`

| Signature | Purpose |
| --- | --- |
| `set_lock_timeout(conn) -> int` | Set lock timeout; return the affected row count. |
| `set_statement_timeout(conn) -> int` | Set statement timeout; return the affected row count. |
| `lock_mapping(conn, writing, exam_id, uid, qid) -> dict \| None` | Lock one mapping for a snapshot or write, preserving the workflow lock order. |
| `assign_grader(conn, actor, exam_id, uid, qid) -> int` | Assign grader; return the affected row count. |
| `mark_question_for_regrade(conn, exam_id, qid) -> int` | Mark all mappings for the question; return their count without changing saved scores. |
| `seed_question_mappings(conn, qid, exam_id) -> int` | Seed enrolled papers for one question; preserve existing owners and statuses. |
| `next_available_answer(conn, exam_id, qid, actor) -> dict \| None` | Lock the next pending/regrade answer, skipping rows claimed by concurrent workers. |
| `claim_answer(conn, actor, exam_id, uid, qid) -> int` | Claim answer; return the affected row count. |
| `release_answer(conn, exam_id, uid, qid) -> int` | Release answer; return the affected row count. |
| `seed_exam_mappings(conn, exam_id) -> int` | Seed enrolled papers across all questions without replacing existing mappings. |
| `course_question_progress(conn, actor, course_id) -> list[dict]` | Course question progress; return rows in query order. |
| `exam_mappings(conn, exam_id) -> list[dict]` | Exam mappings; return rows in query order. |
| `claim_available_answer(conn, actor, exam_id, uid, qid) -> dict \| None` | Claim an unfinished answer only when unowned or already owned by this actor. |
| `mapping_row(conn, exam_id, uid, qid) -> dict \| None` | Mapping row; return None when missing. |
| `reassign_answer(conn, grader_directory_id, exam_id, uid, qid) -> dict \| None` | Reassign answer; return None when missing. |

### `label`

| Signature | Purpose |
| --- | --- |
| `lock_question_labels(conn, exam_id, qid) -> list[dict]` | Read label definitions under shared locks so grading sees a stable rubric. |
| `exam_selected_labels(conn, exam_id, uid) -> list[dict]` | Exam selected labels; return rows in query order. |

### `queries`

| Signature | Purpose |
| --- | --- |
| `update_columns(conn, table, key_column, key, changes, allowed) -> int` | Change only allowed columns. Empty updates are a no-op; None clears a value. |

### `reports`

| Signature | Purpose |
| --- | --- |
| `exam_info(conn, exam_id) -> dict \| None` | Exam info; return None when missing. |
| `exam_questions(conn, exam_id) -> list[dict]` | Exam questions; return rows in query order. |
| `exam_decisions(conn, exam_id) -> list[dict]` | Exam decisions; return rows in query order. |
| `finished_answers(conn, exam_id) -> list[dict]` | Finished answers; return rows in query order. |
| `selected_label_details(conn, exam_id) -> list[dict]` | Selected label details; return rows in query order. |
| `exam_students(conn, exam_id, student) -> list[dict]` | Exam students; return rows in query order. |
| `enrolled_contacts(conn, exam_id) -> list[dict]` | Enrolled contacts; return rows in query order. |

### `roster`

| Signature | Purpose |
| --- | --- |
| `students(conn, *, course_id=None, code=None, term=None) -> list[dict]` | Students, including section and enrollment status, in one course offering. |
| `staff(conn, *, course_id=None, code=None, term=None) -> list[dict]` | Staff in one course offering, ordered by role then name. |

### `rubric`

| Signature | Purpose |
| --- | --- |
| `lock_question(conn, exam_id, qid, *, edit=False) -> dict \| None` | Lock question; return None when missing. |
| `question_row(conn, exam_id, qid) -> dict \| None` | Question row; return None when missing. |
| `question_ids(conn, exam_id) -> list[dict]` | Question ids; return rows in query order. |
| `insert_question(conn, exam_id, qid, grading_method, total_scores) -> int` | Insert question; return the affected row count. |

### `staff`

| Signature | Purpose |
| --- | --- |
| `course_membership(conn, course_id, directory_id) -> dict \| None` | Course membership; return None when missing. |
| `staff_role(conn, directory_id) -> dict \| None` | Staff role; return None when missing. |
| `lock_exam_membership(conn, exam_id, actor) -> dict \| None` | Read the actor role while holding membership and assignment share locks. |
| `staff_exists(conn, directory_id) -> dict \| None` | Staff exists; return None when missing. |
| `add_course_member(conn, course_id, directory_id) -> int` | Add course member; return the affected row count. |
| `lock_course_membership(conn, course_id, actor) -> dict \| None` | Lock course membership; return None when missing. |
| `course_role(conn, course_id, actor) -> dict \| None` | Course role; return None when missing. |
| `upsert_staff(conn, directory_id, name, email, role) -> int` | Upsert staff; return the affected row count. |
| `ensure_course_member(conn, course_id, directory_id) -> int` | Ensure course member; return the affected row count. |

### `student`

| Signature | Purpose |
| --- | --- |
| `lock_exam_enrollment(conn, exam_id, uid) -> dict \| None` | Lock exam enrollment; return None when missing. |
| `upsert_roster_student(conn, uid, name, email) -> dict \| None` | Upsert roster student; return None when missing. |
| `enroll_with_section(conn, course_id, uid, section) -> int` | Enroll with section; return the affected row count. |
| `enroll_student(conn, course_id, uid) -> int` | Enroll student; return the affected row count. |
| `seed_student(conn, uid, name, directory_id) -> int` | Seed student; return the affected row count. |

### `studentpaper`

| Signature | Purpose |
| --- | --- |
| `prune_ungraded_papers(conn, exam_id, matched) -> int` | Remove unmatched papers only when no saved decision would be lost. |
| `paper_path(conn, exam_id, uid) -> dict \| None` | Return the saved scan reference; filesystem authorization belongs to the service. |
| `sync_scanned_papers(conn, exam_id, uids, scan_paths, course_id) -> int` | Upsert matched papers only for enrolled students; preserve unchanged paths. |

### `workflow`

| Signature | Purpose |
| --- | --- |
| `seed_assignment_students(conn, exam_id) -> int` | Seed assignment students; return the affected row count. |
| `sync_student_statuses(conn, actor, matched, suggested, exam_id) -> int` | Sync matches while preserving excused/no-show unless a real paper has arrived. |
| `setup_readiness(conn, exam_id) -> dict \| None` | Setup readiness; return None when missing. |
| `count_students(conn, exam_id: int, readiness: str) -> int` | Count enrolled students failing one named readiness check. |
| `set_assignment_status(conn, target, exam_id) -> int` | Set assignment status; return the affected row count. |
| `lock_student_status(conn, exam_id, uid) -> dict \| None` | Lock student status; return None when missing. |
| `set_student_mark(conn, mark, actor, note, exam_id, uid) -> int` | Set student mark; return the affected row count. |
| `clear_student_mark(conn, actor, exam_id, uid) -> int` | Clear student mark; return the affected row count. |
| `student_progress(conn, exam_id, uid) -> dict \| None` | Student progress; return None when missing. |
| `students_progress(conn, exam_id) -> list[dict]` | Students progress; return rows in query order. |
| `assignment_progress(conn, exam_ids) -> list[dict]` | Assignment progress; return rows in query order. |

## Database lifecycle and retained methods

Methods below use the shared audited connection; an outer `Database.transaction()` composes them in one transaction. Unused methods with future uses are inventoried in REFACTOR_PLAN. Private helpers remain internal.

### `audit.Audit`

| Signature | Purpose |
| --- | --- |
| `audit_context(self, actor_ID: str \| None=None, request_ID: str \| None=None) -> Iterator[None]` | Attach authenticated caller/request metadata without changing business APIs. |
| `flush_audit(self, batch_size: int=500) -> int` | Deliver pending committed events to JSONL; return acknowledged queue rows. |

### `course.Course`

| Signature | Purpose |
| --- | --- |
| `add_course(self, code: str, term: str, title: str \| None=None) -> int` | Create a course offering and return its generated course ID. |
| `get_course_enrollment(self, course_id: int) -> List[Dict[str, Any]]` | Return enrolled student IDs and names for one course. |

### `database.Database`

| Signature | Purpose |
| --- | --- |
| `__init__(self, host: str='localhost', port: int \| str='5432', dbname: str='gradeflow', user: str='postgres', password: str='123456') -> None` | Args:  |
| `from_pool(cls, pool)` | Borrow the application pool; only its lifespan may close it. |
| `get_connection(self) -> ContextManager[psycopg.Connection[Dict[str, Any]]]` |  |
| `transaction(self) -> Iterator['Database']` | Compose existing methods into one commit; keep this scope in one thread. |
| `close(self) -> None` | Close the pool when the application shuts down. |
| `get_worker(self) -> Iterator[psycopg.Cursor[Dict[str, Any]]]` | Yield one cursor; commit on success and roll back on any exception. |
| `get_one(self, cursor: psycopg.Cursor[Dict[str, Any]]) -> Dict[str, Any] \| None` | Fetch the next row from a cursor that has already executed a query. |
| `get_all(self, cursor: psycopg.Cursor[Dict[str, Any]]) -> List[Dict[str, Any]]` | Fetch the remaining rows from a cursor that has already executed a query. |

### `decision.Decision`

| Signature | Purpose |
| --- | --- |
| `get_decision(self, record_ID: int, *, exam_ID: int) -> Dict[str, Any] \| None` | input: the record ID for certain decision |
| `get_decision_by_student_question(self, UID: str, QID: str, *, exam_ID: int) -> Dict[str, Any] \| None` | input: the student UID and QID for certain grading result |
| `save_decision(self, UID: str, QID: str, score: float \| Decimal=0, comments: str \| None=None, *, exam_ID: int) -> int` | input: add a new grading decision (not labels) |
| `update_decision(self, record_ID: int, comments: str \| None=None, *, exam_ID: int) -> bool` | Recalculate from all current selected labels and replace the comment. |
| `get_decision_label(self, record_ID: int, *, exam_ID: int) -> List[Dict[str, Any]]` | Return current label details, record ID, and the staff directory ID. |
| `add_decision_labels(self, record_ID: int, labels: List[int], Graders: List[str], *, exam_ID: int) -> bool` | Replace selected labels and recalculate the score in one audited transaction. |
| `add_decision_label(self, record_ID: int, label: int, Grader: str, *, exam_ID: int) -> bool` | Append one selected label and recalculate; duplicate selections return False. |
| `remove_decision_label(self, record_ID: int, label_ID: int, *, exam_ID: int) -> bool` | Delete one selected label, including the last one, and recalculate the score. |

### `exam.Exam`

| Signature | Purpose |
| --- | --- |
| `add_exam(self, exam_name: str, course_ID: int) -> int` | Create an exam in an existing course and return its generated ID. Its slug is made from the name. |

### `label.Label`

| Signature | Purpose |
| --- | --- |
| `get_label(self, label_ID: int, *, exam_ID: int) -> Dict[str, Any] \| None` | input: label ID |
| `add_label(self, title: str, description: str \| None, deduction: float \| Decimal, *, exam_ID: int) -> int` | input: data required to create a new label |
| `edit_label(self, label_ID, title, description, deduction, *, exam_ID)` |  |
| `remove_label(self, label_ID, *, exam_ID)` |  |

### `rubric.Rubric`

| Signature | Purpose |
| --- | --- |
| `get_rubric(self, QID: str, *, exam_ID: int) -> Dict[str, Any] \| None` | Return one full question using the common query and audited connection. |
| `get_rubric_labels(self, QID: str, *, exam_ID: int) -> List[Dict[str, Any]]` | Return the current labels and question ID; history lives in audit JSONL. |
| `add_rubric_label(self, QID: str, label: int, *, exam_ID: int) -> int` | Append one current label; a duplicate returns its ID without another write. |
| `add_rubric_labels(self, QID: str, labels: List[int], *, exam_ID: int) -> bool` | Replace the current label set, including clearing it with an empty list. |
| `remove_rubric_label(self, QID: str, Label_ID: int, *, exam_ID: int) -> bool` | Delete one current label and report whether a relationship was removed. |
| `add_question(self, QID, title, grading_method, total_scores, region=None, scoring='add', *, exam_ID)` | Create a question independently of its reusable label relationships. |
| `edit_question(self, QID, title, grading_method, total_scores, region=None, scoring='add', *, exam_ID)` | Points and scoring decide every score, so saved scores for this question are recalculated. |
| `remove_question(self, QID, *, exam_ID)` | Delete the current question; FK cascades are captured by audit triggers. |

### `staff.Staff`

| Signature | Purpose |
| --- | --- |
| `get_staff(self, directory_ID: str) -> Dict[str, Any] \| None` | Return a staff profile with its related courses and the global staff role. |
| `get_grader_assignments(self, directory_ID: str, *, exam_ID: int) -> List[Dict[str, Any]]` | input: dirctory_id |
| `assign_grader(self, UID: str, QID: str, directory_ID: str, status: str='Pending', *, exam_ID: int) -> bool` | input: UID, QID, Grader_ID to indicate which question should be assigned to which TA |
| `update_assignment_status(self, UID: str, QID: str, status: str, *, exam_ID: int) -> bool` | input: the UID, QID and new status to our assignment |
| `add_staff(self, directory_ID: str, name: str, email: str \| None=None, *, role: str) -> bool` | Create a global staff member; return False for an existing directory ID. |
| `add_staff_to_course(self, course_ID: int, directory_ID: str) -> bool` | Add a membership using the shared query without changing an existing one. |

### `student.Student`

| Signature | Purpose |
| --- | --- |
| `get_student(self, UID: str, *, exam_ID: int \| None=None) -> Dict[str, Any] \| None` | Return global student data, or student data joined to one exam paper. |
| `add_student(self, UID: str, name: str, email: str \| None=None) -> bool` | Create a global student; return False if the UID already exists. |
| `add_student_to_course(self, course_ID: int, UID: str) -> bool` | Enroll an existing student using the common persistence function. |

### `studentpaper.StudentPaper`

| Signature | Purpose |
| --- | --- |
| `add_student_paper(self, UID: str, scanned_PDF: str, comments: str \| None=None, *, exam_ID: int) -> bool` | Add one enrolled student's exam paper without overwriting an existing paper. |
| `update_student_paper(self, UID: str, scanned_PDF: str \| None=None, comments: str \| None=None, *, exam_ID: int) -> bool` | Update the supplied PDF reference and/or comment; return False if missing. |
