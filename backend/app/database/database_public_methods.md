# Database v2 Public API

This release is based on the newly uploaded v2 package, not the earlier single-file implementation. Existing public method arguments, defaults and return annotations are preserved. The same `from database import Database` entry point is retained.

## Common behavior

- Python 3.10+ and `psycopg[binary,pool]` are required.
- Unquoted PostgreSQL column names produce lowercase dictionary keys.
- UID is a nine-digit TEXT string; staff directory IDs are lowercase strings.
- Numeric row fields are Decimal (or None when the schema allows NULL); get_student_total_score returns float or None for an invalid convertible UID.
- No relationship version column remains. Current relationship rows contain no historical snapshots.
- get_rubric_labels returns Label fields plus qid; get_decision_label returns Label fields plus record_id and directory_id.
- Single-row reads return None if missing; list reads return []; missing rubric/decision write targets raise ValueError.
- Batch label methods replace the whole current set; an empty list clears it. Duplicate input labels raise ValueError. A duplicate single rubric insertion returns its ID; a duplicate single decision-label insertion returns False.
- Removing a missing current label returns False; removing the final selected label is valid and sets the label-derived decision score to zero.
- Score = SUM(current selected Label.deduction), with signed positive/negative contributions and no clamping.
- update_decision(comments=None) clears the stored comment, as specified by the uploaded v2 signature and implementation.
- update_student_paper uses None to preserve an omitted field; an empty string can clear a comment. Both fields omitted raises ValueError; a missing paper returns False.
- SQL errors, validation errors, and failed audit capture roll back the entire business transaction. A file-export failure after commit keeps durable outbox rows for retry and does not pretend the business write rolled back.

## Returned row shapes

Named shapes below are dictionary descriptions, not additional Python classes.

| Shape | Fields and Python value types |
|---|---|
| StudentRow | uid: str; name: str; email: str or None |
| StudentPaperRow | uid: str; name: str; email: str or None; exam_id: int; scanned_pdf: str; comments: str or None |
| EnrollmentRow | uid: str; name: str |
| CourseExamRow | exam_id: int; exam_name: str |
| StaffCourseRow | course_id: int; code: str; term: str; title: str or None; role: str |
| StaffProfile | directory_id: str; name: str; email: str or None; courses: list[StaffCourseRow] |
| ExamRow | exam_id: int; course_id: int; exam_name: str |
| RubricRow | exam_id: int; qid: str; grading_method: str; total_scores: Decimal or None |
| LabelRow | exam_id: int; label_id: int; title: str; description: str or None; deduction: Decimal or None |
| RubricLabelRow | All LabelRow fields plus qid: str |
| DecisionLabelRow | All LabelRow fields plus record_id: int; directory_id: str or None |
| MappingRow | exam_id: int; uid: str; qid: str; directory_id: str or None; status: str or None |
| DecisionRow | exam_id: int; record_id: int; uid: str; qid: str; scores: Decimal or None; comments_remark: str or None |

## Methods

### `audit_context`

- **Module:** `database.audit`
- **Input:** `actor_ID: str | None=None, request_ID: str | None=None`
- **Output:** ContextManager[None].
- **Functionality:** Attach authenticated actor and request metadata to transactions in the current execution context.

### `flush_audit`

- **Module:** `database.audit`
- **Input:** `batch_size: int=500`
- **Output:** int.
- **Functionality:** Export pending committed audit events to JSONL and acknowledge only events successfully synced to disk.

### `add_course`

- **Module:** `database.course`
- **Input:** `code: str, term: str, title: str | None=None`
- **Output:** int: generated course_id.
- **Functionality:** Create one course offering identified by its code and academic term.

### `get_course_enrollment`

- **Module:** `database.course`
- **Input:** `course_ID: int`
- **Output:** list[EnrollmentRow].
- **Functionality:** Return enrolled student IDs and student names for one course.

### `__init__`

- **Module:** `database.database`
- **Input:** `host: str='localhost', port: int | str='5432', dbname: str='gradeflow', user: str='postgres', password: str='123456'`
- **Output:** None (the constructor expression returns a Database instance).
- **Functionality:** Initialize a shared PostgreSQL connection pool for all courses and exams.

### `get_connection`

- **Module:** `database.database`
- **Input:** `No arguments`
- **Output:** ContextManager[psycopg.Connection[dict[str, Any]]].
- **Functionality:** Borrow a database connection that commits on success and rolls back on an exception.

### `transaction`

- **Module:** `database.database`
- **Input:** `No arguments`
- **Output:** Iterator['Database']
- **Functionality:** Compose existing methods into one commit; keep this scope in one thread.

### `close`

- **Module:** `database.database`
- **Input:** `No arguments`
- **Output:** None.
- **Functionality:** Close the shared connection pool when the application shuts down.

### `get_worker`

- **Module:** `database.database`
- **Input:** `No arguments`
- **Output:** ContextManager[psycopg.Cursor[dict[str, Any]]].
- **Functionality:** Borrow one cursor with a transaction that commits on success and rolls back on an exception.

### `get_one`

- **Module:** `database.database`
- **Input:** `cursor: psycopg.Cursor[Dict[str, Any]]`
- **Output:** dict[str, Any] | None.
- **Functionality:** Fetch the next dictionary row from a cursor that has already executed a query.

### `get_all`

- **Module:** `database.database`
- **Input:** `cursor: psycopg.Cursor[Dict[str, Any]]`
- **Output:** list[dict[str, Any]].
- **Functionality:** Fetch all remaining dictionary rows from a cursor that has already executed a query.

### `get_grading_decision`

- **Module:** `database.decision`
- **Input:** `UID: str, *, exam_ID: int`
- **Output:** list[DecisionRow] | None.
- **Functionality:** Return all saved decisions for one student in one exam.

### `get_student_total_score`

- **Module:** `database.decision`
- **Input:** `UID: str, *, exam_ID: int`
- **Output:** float | None.
- **Functionality:** Return the sum of saved decision scores for one student in one exam.

### `get_decision`

- **Module:** `database.decision`
- **Input:** `record_ID: int, *, exam_ID: int`
- **Output:** DecisionRow | None.
- **Functionality:** Return a decision only when its record ID belongs to the requested exam.

### `get_decision_by_student_question`

- **Module:** `database.decision`
- **Input:** `UID: str, QID: str, *, exam_ID: int`
- **Output:** DecisionRow | None.
- **Functionality:** Return the current decision for one student question in one exam.

### `save_decision`

- **Module:** `database.decision`
- **Input:** `UID: str, QID: str, score: float | Decimal=0, comments: str | None=None, *, exam_ID: int`
- **Output:** int: generated record_id.
- **Functionality:** Create the single current decision for an existing student question assignment.

### `update_decision`

- **Module:** `database.decision`
- **Input:** `record_ID: int, comments: str | None=None, *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Recalculate a decision from its latest selected labels and replace its comment.

### `get_decision_label`

- **Module:** `database.decision`
- **Input:** `record_ID: int, *, exam_ID: int`
- **Output:** list[dict[str, Any]].
- **Functionality:** Return current selected label definitions with record and staff directory IDs.

### `add_decision_labels`

- **Module:** `database.decision`
- **Input:** `record_ID: int, labels: List[int], Graders: List[str], *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Replace current selected labels and recalculate the direct signed sum in one transaction.

### `add_decision_label`

- **Module:** `database.decision`
- **Input:** `record_ID: int, label: int, Grader: str, *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Append one selected label to a decision and recalculate its direct signed sum.

### `remove_decision_label`

- **Module:** `database.decision`
- **Input:** `record_ID: int, label_ID: int, *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Physically delete one selected label and recalculate the score, including zero after the last removal.

### `_validate_graders` (private helper)
- **Module:** `database.decision`
- **Input:** `cursor, graders: List[str], *, exam_ID: int`
- **Output:** None.
- **Functionality:** check whether this grader are assigned to this exam of thsi course

### `_recalculate_score` (private helper)
- **Module:** `database.decision`
- **Input:** `cursor, record_ID: int, exam_ID: int`
- **Output:** None.
- **Functionality:** recalculate the scores of some decision

### `add_exam`

- **Module:** `database.exam`
- **Input:** `exam_name: str, course_ID: int`
- **Output:** int: generated exam_id.
- **Functionality:** Create a named exam belonging to an existing course.

### `get_exam`

- **Module:** `database.exam`
- **Input:** `exam_ID: int`
- **Output:** ExamRow | None.
- **Functionality:** Return the ID, owning course ID, and name of an exam.

### `get_course_exams`

- **Module:** `database.exam`
- **Input:** `course_ID: int`
- **Output:** list[CourseExamRow].
- **Functionality:** Return exam IDs and exam names for one course.

### `get_label`

- **Module:** `database.label`
- **Input:** `label_ID: int, *, exam_ID: int`
- **Output:** LabelRow | None.
- **Functionality:** Return a label only when it belongs to the requested exam.

### `add_label`

- **Module:** `database.label`
- **Input:** `title: str, description: str | None, deduction: float | Decimal, *, exam_ID: int`
- **Output:** int: generated label_id.
- **Functionality:** Create an exam-specific label with a positive, zero, or negative numeric contribution.

### `get_rubric`

- **Module:** `database.rubric`
- **Input:** `QID: str, *, exam_ID: int`
- **Output:** RubricRow | None.
- **Functionality:** Return the rubric for a particular question in one exam.

### `get_rubric_labels`

- **Module:** `database.rubric`
- **Input:** `QID: str, *, exam_ID: int`
- **Output:** list[dict[str, Any]].
- **Functionality:** Return current label definitions and their question ID for one exam rubric.

### `add_rubric_label`

- **Module:** `database.rubric`
- **Input:** `QID: str, label: int, *, exam_ID: int`
- **Output:** int.
- **Functionality:** Append one current rubric label without duplicating an existing relationship.

### `add_rubric_labels`

- **Module:** `database.rubric`
- **Input:** `QID: str, labels: List[int], *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Replace the current rubric label set, including clearing it with an empty list.

### `remove_rubric_label`

- **Module:** `database.rubric`
- **Input:** `QID: str, Label_ID: int, *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Physically delete one current rubric label, including the final label.

### `update_rubric`

- **Module:** `database.rubric`
- **Input:** `QID: str, Label_ID: int, old_label_ID: int | None=None, *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Replace one current rubric relationship while audit files preserve the before and after images.

### `get_staff`

- **Module:** `database.staff`
- **Input:** `directory_ID: str`
- **Output:** StaffProfile | None.
- **Functionality:** Return staff identity and name together with all related courses and global staff role.

### `get_grader`

- **Module:** `database.staff`
- **Input:** `directory_ID: str`
- **Output:** StaffProfile | None.
- **Functionality:** Return the same staff profile and related courses as get_staff using the historical method name.

### `get_grader_assignments`

- **Module:** `database.staff`
- **Input:** `directory_ID: str, *, exam_ID: int`
- **Output:** list[MappingRow].
- **Functionality:** Return all assignments for a staff directory ID within one exam.

### `assign_grader`

- **Module:** `database.staff`
- **Input:** `UID: str, QID: str, directory_ID: str, status: str='Pending', *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Assign one enrolled student question to a staff member belonging to the exam course.

### `update_assignment_status`

- **Module:** `database.staff`
- **Input:** `UID: str, QID: str, status: str, *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Update the status of one existing exam-specific student question assignment.

### `add_staff`

- **Module:** `database.staff`
- **Input:** `directory_ID: str, name: str, email: str | None=None, *, role: str`
- **Output:** bool.
- **Functionality:** Create a global staff profile without overwriting an existing directory identity.

### `add_staff_to_course`

- **Module:** `database.staff`
- **Input:** `course_ID: int, directory_ID: str`
- **Output:** bool.
- **Functionality:** Add a staff member to a course with a global staff role without changing an existing membership.

### `get_student`

- **Module:** `database.student`
- **Input:** `UID: str, *, exam_ID: int | None=None`
- **Output:** dict[str, Any] | None; StudentRow without exam_ID, or StudentPaperRow when exam_ID is supplied.
- **Functionality:** Return global student identity or the student identity joined to a particular exam paper.

### `add_student`

- **Module:** `database.student`
- **Input:** `UID: str, name: str, email: str | None=None`
- **Output:** bool.
- **Functionality:** Create a global student without overwriting an existing student record.

### `add_student_to_course`

- **Module:** `database.student`
- **Input:** `course_ID: int, UID: str`
- **Output:** bool.
- **Functionality:** Enroll an existing student in an existing course without duplicating the membership.

### `add_student_paper`

- **Module:** `database.studentpaper`
- **Input:** `UID: str, scanned_PDF: str, comments: str | None=None, *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Create an exam paper for an enrolled student without overwriting an existing paper.

### `update_student_paper`

- **Module:** `database.studentpaper`
- **Input:** `UID: str, scanned_PDF: str | None=None, comments: str | None=None, *, exam_ID: int`
- **Output:** bool.
- **Functionality:** Update the supplied PDF reference and/or comment of an existing exam paper.

## Audit delivery

Set GRADEFLOW_AUDIT_DIR to the intended history directory before constructing Database. The default is logs/audit relative to the process working directory. Daily audit-YYYY-MM-DD.jsonl files are independent from config_logging's rotating runtime logs and are not automatically deleted.

The temporary audit_outbox table is a delivery queue, not the retained history store. Row triggers record OLD/NEW images in the business transaction. Once that transaction commits, the package appends JSONL records, flushes/fsyncs the file, and deletes acknowledged queue rows. Inserts have old_data=null; deletes have new_data=null. Related row changes share transaction_id. BASELINE entries preserve pre-migration data, including legacy version fields inside their JSON images.

File delivery is at least once: a crash after appending a complete line but before queue acknowledgement can replay an event. Consumers must deduplicate by event_id. Event ID allocation is not a claim about cross-transaction commit order. Committed records remain queued during a file outage. Retry with flush_audit(); the caller of that explicit method receives file errors. Automatic delivery logs the error and defers it instead of raising a misleading business-write failure. Keep the audit directory and its filesystem durable and do not manually edit complete audit records.

Audit history covers INSERT/UPDATE/DELETE on all 13 business tables, including raw SQL through the public connection and foreign-key cascades. Reads are not audited. TRUNCATE is rejected because it lacks per-row before images. DROP/ALTER operations and privileged administrator tampering are outside this application audit guarantee.

Use actual authenticated caller metadata rather than assuming a supplied grading argument is the logged-in actor:

```python
from database import Database, config_logging

config_logging(log_file="logs/runtime.jsonl")
db = Database(password="your_password")
try:
    with db.audit_context(actor_ID="alice", request_ID="http-request-123"):
        db.update_student_paper(123456789, comments="Checked", exam_ID=1)
    db.flush_audit()
finally:
    db.close()
```

No actor metadata means actor_id=null; db_user still identifies the PostgreSQL session role. Context-local values reset on leaving the context manager, and transaction-local settings cannot leak through pool reuse. Existing methods still require the backend to enforce the logged-in user's permissions.

## Logging API

`JsonFormatter(service: str = "database info")` formats runtime LogRecord values as JSON with optional structured extras and exception stacks. `config_logging(log_file: str | os.PathLike | None = None, level: int = logging.INFO, service: str = "database", max_bytes: int = 100 * 1024 * 1024, backup_count: int = 50, console: bool = True) -> None` configures diagnostic handlers. Neither is the durable audit writer.


## Integration changes

- `Database.from_pool(pool)` borrows the app pool; `close()` flushes audit but only closes an owned pool.
- `add_staff(directory_ID, name, email=None, *, role)` creates only; `app.add_staff` remains the CLI upsert operation.
- `add_staff_to_course(course_ID, directory_ID)` adds membership only. Role lives in `staff`, as defined by migration 001.
- `add_question` / `edit_question(QID, title, grading_method, total_scores, region=None, *, exam_ID)` manage question definitions. `remove_question(QID, *, exam_ID)` cascades current assignments and decisions.
- `edit_label(label_ID, title, description, deduction, *, exam_ID)` and `remove_label(label_ID, *, exam_ID)` recalculate all affected current decisions in the same transaction.
- `validate_graders` and `recalculate_score` are private helpers, named `_validate_graders` and `_recalculate_score`.
- `Decision.internal_note` is staff-only; `comments_remark` is student feedback. Staff API responses may include both; student reports must use an explicit field whitelist.
- Apply 004 to repair an already-applied early 003. This does not convert databases bootstrapped from the old combined schemas.sql; back up and plan that conversion separately.
- Independent named regrade queues, splitting, rubric copy/import and score overrides are not implemented by this change.
