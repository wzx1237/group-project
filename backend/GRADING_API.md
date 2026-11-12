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
outside that directory are refused.

The `/api/assignments/{assignment_id}` routes also accept upload-store IDs such as
`quiz-1` (`data/db.json`). The first request creates the matching `Exam` row
(`Exam.slug`), and every request adds a `StudentPaper` for each scan matched or
assigned to an enrolled student. Unassigning a scan keeps its paper and grades.

TAs and instructors have the same rubric permissions. Either may initialize a
question with `POST /api/exams/{exam_ID}/rubric/questions`:

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

`start` records who is grading an answer in `Mapping`, so other TAs' `start` skips it.
`POST /api/exams/{exam_ID}/students/{UID}/questions/{QID}/release` releases an own
unfinished answer. Claims have no automatic expiration; explicitly release work
when leaving the grading screen. TAs and instructors may open and save any answer
in their course without replacing its owner, and either may reassign work. No DB
lock spans browser editing.

## Reads and saves

| Method | Path under `/api` | Purpose |
| --- | --- | --- |
| GET | `/exams/{exam_ID}/students/{UID}/questions/{QID}/workspace` | Consistent current workspace; does not claim or create a decision |
| GET | `/exams/{exam_ID}/questions/{QID}/rubric` | Rubric/labels and `rubric_token` |
| POST | `/exams/{exam_ID}/students/{UID}/questions/{QID}/grade` | First decision, HTTP 201 |
| PUT | `/exams/{exam_ID}/students/{UID}/questions/{QID}/grade` | Replace an existing decision, HTTP 200, preserving record ID |
| POST | `/exams/{exam_ID}/questions/{QID}/rubric/labels` | Add a criterion and requeue every mapping of that exam/question |
| GET | `/assignments/{assignment_id}/decisions` | Every saved decision for enrolled students, as `{UID: {QID: decision}}` |
| GET | `/assignments/{assignment_id}/question-progress` | Grading progress for the whole exam: `{questions: [{qid, total, finished, regrade}], students: [{uid, name, questions, finished, regrade, status, answers}]}` |

`question-progress` covers enrolled students with a paper, for every grader, and
only questions graded on their own (a question with parts is graded through its
parts). In `questions`, `total` is the students with a paper, `finished` the answers
whose mapping is `Finished`, and `regrade` those in `Regrade`; the rest are
ungraded. `students` has one entry per student, ordered by name. Its `answers` maps
each `qid` to the mapping status in lower case (`pending` when none), and `status`
is `graded` (all finished), `regrade` (any waiting), `in_progress` (some work
saved) or `not_started`. Any TA or instructor in the exam's course may read it;
others get 403. Students who are no longer enrolled are left out.

```json
{"questions":[{"qid":"Q1","total":2,"finished":1,"regrade":1}],
 "students":[{"uid":"123456789","name":"Student","questions":1,"finished":1,"regrade":0,
              "status":"graded","answers":{"Q1":"finished"}},
             {"uid":"234567890","name":"Student Two","questions":1,"finished":0,"regrade":1,
              "status":"regrade","answers":{"Q1":"regrade"}}]}
```

The frontend reads it in `frontend/src/services/gradingDecisionService.js`
(`fetchExamProgress`) for the per-question rows on the grade page and for the
grading progress page at `/courses/{course}/exams/{exam}/progress`.

Grade/regrade body:

```json
{"labels":[1,2],"comments":"Check the final step."}
```

The optional compatibility field `directory_ID` must equal the authenticated
actor; omitting it is recommended. `labels: []` saves the comment but leaves the
answer ungraded: its score is `null` and its mapping stays `InProgress`. A graded
zero is a 0-point label such as "No credit".
Comments are student-visible feedback; private internal notes are not supported
by this schema/API. Comments `null` clear the current comment.

Each question's `scoring` decides where its score starts. A `deduct` question starts
at full points and an `add` question starts at 0; questions default to `add`. The
signed selected Label contributions are added to that start, and the result is kept
between 0 and the question's points. On a 5-point `add` question, `+5` and `-1`
yield `4` and only `-1` yields `0`. On a 5-point `deduct` question, only `-2` yields
`3`, and `0`-point "Correct" yields `5`. Changing a question's points or scoring recalculates
its saved scores. Duplicate labels and labels from another exam/question are rejected.
Label contributions must fit NUMERIC(5,2) without rounding.

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
