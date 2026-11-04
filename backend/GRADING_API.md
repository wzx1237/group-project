# PostgreSQL grading API

These routes are registered in the existing `app.main:create_app` FastAPI app.
Authentication uses its existing signed UMD CAS session (`current_user`), not a
client-supplied identity header. No new dependencies or second PostgreSQL pool
are required. Grading reads/writes the v2 PostgreSQL tables only; the existing
JSON upload/distribution store remains separate and is not the grading database.

## Run and initialize

From the repository root, start `docker compose up -d db`. From `backend/`:

```sh
.venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:create_app --factory --reload
```

`DATABASE_URL` and `SESSION_SECRET` are read from `backend/.env`. New empty
databases initialize from `app/migrations/schemas.sql`, the unified v2 schema.
The historical 001/002 definitions are alternatives, not preceding migrations
of this schema. Existing legacy databases are rejected without overwriting data;
back up and perform an explicitly reviewed legacy-to-v2 migration separately.
Existing v2 databases are left intact. Initialization and CSV seeding are repeatable.
Staff roles now belong to `course_staff`, matching v2. The v2 student schema has
no directory ID; legacy roster APIs return `null` for that unavailable field.

An exam and its enrolled student papers must exist in PostgreSQL. Existing
`Database.add_exam`, `add_student_paper`, and `assign_grader` methods remain
available with unchanged signatures. `StudentPaper.scanned_PDF` is a PDF path
relative to `data/` (or an absolute path inside `GRADEFLOW_DATA_DIR`). Paths
outside that directory are refused. Uploads still in the legacy JSON pipeline
are not automatically registered as PostgreSQL student papers by these APIs.

Instructors may initialize a question with `POST /api/exams/{exam_ID}/rubric/questions`:

```json
{"qid":"Q1","grading_method":"manual","total_score":"5.00"}
```

This creates unassigned `Pending` mappings for existing enrolled papers.
`start` also initializes missing mappings for papers received later. This API
stores the grading method; automatic answer recognition is outside this change.

## TA flow

1. `GET /api/courses`: only courses in the signed-in staff member's membership.
2. `GET /api/courses/{course_ID}/questions`: exam/question identifiers, full marks,
   own assigned/finished/regrade counts and the number of available answers.
3. `POST /api/exams/{exam_ID}/questions/{QID}/start`: resume an own unfinished
   answer or claim an unassigned answer atomically. Returns a workspace with
   `UID`, `QID`, rubric, labels, assignment, previous decision, selected labels,
   `grade_token`, `rubric_token`, and authenticated `pdf_url`.
4. Fetch the `pdf_url` to display the scan. It serves the student's complete PDF;
   the current schema has no question-region coordinates for automatic cropping.
5. Send the selected Label IDs and comment to grade/regrade, with the token from
   the workspace. Then call `start` again to continue to the next answer.

`start` persists ownership in `Mapping`; other TAs cannot edit that answer.
`POST /api/exams/{exam_ID}/students/{UID}/questions/{QID}/release` releases an own
unfinished answer. Claims have no automatic expiration; explicitly release work
when leaving the grading screen. Instructors may review/save other assigned
answers but do not silently replace their owner. No DB lock spans browser editing.

## Reads and saves

| Method | Path under `/api` | Purpose |
| --- | --- | --- |
| GET | `/exams/{exam_ID}/students/{UID}/questions/{QID}/workspace` | Consistent current workspace; does not claim or create a decision |
| GET | `/exams/{exam_ID}/questions/{QID}/rubric` | Rubric/labels and `rubric_token` |
| POST | `/exams/{exam_ID}/students/{UID}/questions/{QID}/grade` | First decision, HTTP 201 |
| PUT | `/exams/{exam_ID}/students/{UID}/questions/{QID}/grade` | Replace an existing decision, HTTP 200, preserving record ID |
| POST | `/exams/{exam_ID}/questions/{QID}/rubric/labels` | Add a criterion and requeue every mapping of that exam/question |

Grade/regrade body:

```json
{"labels":[1,2],"comments":"Check the final step."}
```

The optional compatibility field `directory_ID` must equal the authenticated
actor; omitting it is recommended. `labels: []` is a valid graded zero.
Comments are student-visible feedback; private internal notes are not supported
by this schema/API. Comments `null` clear the current comment.

Scores are the direct **sum of signed selected Label contributions**, using
Decimal: `+5` and `-1` yield `4`; only `-1` yields `-1`. Full marks are not added
implicitly. Duplicate labels and labels from another exam/question are rejected.
Contributions and totals must fit NUMERIC(5,2) without rounding.

All grade/regrade requests require `If-Match: <grade_token>`. Add-label requests
require `If-Match: <rubric_token>`, with body:

```json
{"title":"Missing reasoning","description":"Explain the final step.","deduction":"-1.00"}
```

Copy the token including its quotation marks. Tokens hash current content, not
history versions or credentials. A missing header gives 428; a stale snapshot
gives 412. Refresh and let the TA review before retrying; do not silently retry
an old choice with a fresh token. Authentication failures give 401, course/owner
failures 403, missing work 404, wrong initial/regrade operation 409, invalid
amounts/labels 422. Retryable database lock/transaction failures give 503.

## Regrade and atomicity

Adding a Label stores its definition/link and changes **every** matching Mapping
(including unfinished answers) to the exact status `Regrade` in one transaction.
Old decisions, selected labels and scores remain until review. The new Label is
not automatically applied. An answer without a decision still uses POST for its
first save; an existing decision uses PUT. Saving marks the mapping `Finished`.
Other exams and questions are unaffected. This implements one regrade status per
answer, not multiple independently named review queues.

The service composes existing Database methods inside `Database.transaction()`.
Lock order is membership/exam, rubric, label, mapping, then decision. Grading
holds a shared rubric lock and locks its answer; rubric additions hold a
conflicting rubric lock. If grading commits first, the later edit requeues it;
if the edit commits first, an old grading snapshot is rejected. Same-answer
writes serialize, while different answers can grade concurrently.

Decision, selected labels, comment, score, mapping status and audit outbox rows
commit or roll back together. Current relationship rows are physically replaced;
JSONL audit preserves old/new images and the CAS actor. Configure a durable,
access-controlled `GRADEFLOW_AUDIT_DIR` (default `backend/logs/audit` when launched
from backend). Post-commit delivery failures leave outbox events for retry and
do not misreport an already committed grade as rolled back. Raw database writes
must follow the same lock protocol; low-level helpers do not enforce the entire
application workflow themselves.

## Tests

From `backend/`, with a local development PostgreSQL role able to create schemas:

```sh
GRADEFLOW_TEST_DSN='postgresql://gradeflow:gradeflow@127.0.0.1:5432/gradeflow' .venv/bin/pytest -q
```

The native tests create/drop unique isolated schemas and exercise real PostgreSQL
transactions; no application data is deleted. Without this variable, native
integration tests are explicitly skipped. The existing unit tests mock DB/CAS.
Live UMD SSO and browser frontend wiring are separate from these backend checks.

## Frontend integration

The Next.js `/courses` page now reads `/api/courses` and links to
`/courses/{course_ID}`, which displays actual exam/question workloads. Selecting
a question opens `/courses/{course_ID}/exams/{exam_ID}/grade?qid={QID}`.
The workspace explicitly claims/resumes work on a button click, embeds the
protected PDF URL, presents current labels and previous decisions, and submits
POST/PUT according to whether a decision exists. It supports releasing work,
advancing to the next answer, and adding a shared criterion with confirmation.
After a 412 conflict or a rubric addition, saving is disabled until the TA
explicitly reloads and reviews the current workspace. Failed writes are not
automatically retried. Reloading prompts before replacing local edits.

Run the backend on port 8000 and `cd frontend && npm run dev` in another
terminal. The existing Next rewrite forwards `/api` to the backend, retaining
session cookies; no cross-origin token or CORS configuration is needed.
`GRADEFLOW_API` may override the backend origin before starting/building Next.
Sign in through the existing CAS screen. The PDF is a full scan, not a cropped
answer region. The old JSON distribution upload pipeline still requires a
separate PostgreSQL StudentPaper registration step.

Frontend validation: `cd frontend && npm test` runs service-contract and
workspace-interaction tests; `npm run build` validates the production routes.
Local proxy checks used a development-only signed staff session to verify
course/question API responses; this is not a live UMD CAS/browser acceptance test.
