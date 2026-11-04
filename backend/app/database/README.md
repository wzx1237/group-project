# Gradeflow Database v2: Current State and JSONL Audit History

This release edits the eleven newly uploaded v2 Python files. It retains the existing Database/mixin package structure, the connection pool maximum of 30, every existing function header/default/return annotation, the signed deduction scoring rule, and the original public import entry point.

The source schema is the latest available unified_schema (1).sql from the preceding work; no SQL attachment was supplied with this v2 request. All business columns/foreign keys remain except for the relationship version columns and their primary-key components. The single added table, audit_outbox, is a temporary delivery queue rather than the long-term history store.

## Files and Changes

- database/: the original modules plus one new module, audit.py.
- database.py within that directory is the uploaded database(2).py restored to its package import filename.
- schemas.sql: full current-state schema for a new, empty database.
- migrate_v2.sql: guarded one-time migration from the previous versioned schema.
- database_public_methods.md: English reference for all public methods.
- test_database.py and test_audit.py: regression, audit-delivery, and migration tests.
- expected_headers.json: reference signatures from the newly uploaded v2 files.
- testdata/legacy_schema.sql: the previous schema, used only by migration tests.

No deployed database was changed. Do not run schemas.sql against existing tables. Apply the migration before using this package with an old database.

## Why Remove Relationship version?

Rubric_Label and Decision_Label now hold only the current set. Their keys are respectively (exam_ID, QID, Label_ID) and (exam_ID, record_ID, Label_ID). Old images are recorded in audit files before their source rows disappear from the current tables.

A version column in those current-only rows no longer selects history. It also does not provide optimistic concurrency protection because the existing method headers do not accept an expected version. Updating just one row can create mixed versions; deleting the final row loses any counter derived from MAX(version). Keeping that counter would add coordination without supporting a current requirement.

Parent Rubric/Decision row locks still serialize modifications to each label set, including empty sets. If the client later needs named rubric releases or optimistic conflict detection, add an explicit parent revision and expected-revision API for that separate purpose. This release adds neither.

Current tables no longer retain old relationship versions. Audit rows include their own UUID event_id, transaction_id and occurrence timestamp; these identify changes rather than pretending that each current relationship row is a history version.

## JSON Files Are the History Store

Set GRADEFLOW_AUDIT_DIR before constructing Database. The default directory is logs/audit under the application's working directory.

```python
import os
from database import Database, config_logging

os.environ['GRADEFLOW_AUDIT_DIR'] = '/durable-storage/gradeflow/audit'
config_logging(log_file='logs/runtime.jsonl')

db = Database(password='your_password')
try:
    with db.audit_context(actor_ID='alice', request_ID='request-123'):
        db.update_student_paper(123456789, comments='Checked', exam_ID=1)
    db.flush_audit()
finally:
    db.close()
```

Use a path appropriate to the deployment, including a Windows path when applicable. Configure application workers consistently and keep the audit directory on durable storage with backups. Daily audit-YYYY-MM-DD.jsonl files are not automatically rotated away or deleted. config_logging's rotating files are runtime diagnostics and must not be treated as retained audit history.

Existing method headers have not changed. The only new public methods are:

- audit_context(actor_ID: str | None = None, request_ID: str | None = None): attach caller/request metadata for the context; pass the authenticated identity from the backend.
- flush_audit(batch_size: int = 500) -> int: export pending committed rows and return the acknowledged count; explicit calls raise delivery errors for the operator to handle.

Private helpers centralize file locking, delivery, row locking, current-score recalculation, and schema checks. They do not introduce another connection pool or change the existing domain modules.

## Commit and Delivery Rules

1. PostgreSQL AFTER row triggers capture INSERT/UPDATE/DELETE old/new row images on all thirteen business tables. Raw SQL through public connections and foreign-key cascades are covered too.
2. The business change and its outbox record commit in one database transaction. A failed business statement or failed capture rolls back both. No failed/rolled-back change is exported as a committed audit event.
3. Only after commit does the package append JSON lines, flush and fsync the file, then delete acknowledged outbox rows. The directory entry is also fsynced on POSIX. Events remain queued if file delivery fails.
4. Automatic delivery failure is logged but does not raise a misleading business-write failure after a successful commit. A later successful operation, explicit flush_audit(), or normal close retries pending delivery. Schedule explicit retries/monitor SELECT COUNT(*) FROM audit_outbox if the service can remain idle after an outage.
5. A crash after file append but before queue acknowledgement may replay complete lines. Delivery is at least once, not exactly once; deduplicate consumers by the UUID event_id. Its identity remains stable across retries. Queue sequence order is not a guarantee of cross-transaction commit order.

The exporter serializes cooperating writers with a directory lock. It repairs only an unterminated trailing line left by an interrupted append; the unacknowledged event can then be retried. Complete old audit lines are never rewritten. Do not manually edit audit files or delete unexported queue records.

The queue is emptied after successful delivery; no permanent duplicate audit table is maintained. Its old/new images may temporarily remain in the database while delivery is pending. This is intentional protection against a disk outage, not a continuation of soft deletion.

## Audit Event Format

Each JSON line contains:

| Field | Meaning |
|---|---|
| event_id | Stable UUID used for replay deduplication. |
| timestamp | UTC time the row change was captured; not a claimed commit-order timestamp. |
| database, schema, table | Origin of the affected row. |
| transaction_id | PostgreSQL transaction ID, serialized as text to avoid wide-integer client precision loss. |
| operation | INSERT, UPDATE, DELETE, or migration BASELINE. |
| row_key | Primary-key fields identifying the affected row. |
| old_data | Full old row, or null for an insertion/baseline. |
| new_data | Full new row, or null for a deletion. |
| actor_id | Backend-supplied authenticated user, or null when not supplied. |
| request_id | Supplied request ID or a generated correlation ID. |
| db_user | PostgreSQL session role, distinct from the end user. |

All steps of a multi-row replacement share transaction_id. A single transaction can contain several row events, including intermediate score/comment updates; those rows are one committed transaction, not separate commits. NUMERIC values are serialized by PostgreSQL and exported as its JSON text, avoiding a Python float conversion in the writer.

No actor is guessed from a Grader argument. The backend still must authenticate callers and enforce assignment permissions. File history is not cryptographic tamper evidence, and privileged database/filesystem administrators can bypass application protections.

## Behavior Fixes

- The logging formatter now calls super().__init__ correctly, reads structured extras with getattr, and formats exception stacks even when extras are absent; it does not mutate LogRecord extras across handlers.
- Current rubric/decision label getters again return label title/description/deduction information, plus current relationship identifiers, with no version field.
- First label insertion works. Duplicate single additions do not create duplicate relationships. Batch lists reject duplicates or mismatched graders.
- Batch replacement physically deletes previous relationships; deleting the final relationship and clearing a set are valid. Label-derived score becomes zero for an empty selection.
- The target Rubric/Decision parent row is locked across the whole operation, and all SQL steps use the same transaction.
- Newly supplied graders are checked against the exam course; the signed deduction sum remains unchanged.
- update_student_paper correctly handles PDF-only, comment-only, and combined updates; no matching paper returns False. Supplying neither field raises ValueError; None means omitted for this method, while an empty string clears a comment.
- update_decision(comments=None) explicitly clears its comment, retaining the uploaded v2 semantics.
- Existing read/add course, student, staff, exam, and label methods retain their signatures and are covered automatically by database audit triggers.

## Installation and Migration

Use Python 3.10+ and PostgreSQL with built-in gen_random_uuid (PostgreSQL 13+; tests used PGlite's PostgreSQL engine).

```bash
python -m pip install "psycopg[binary,pool]"
```

For a new database, execute schemas.sql once. For an existing database using the prior versioned schema, stop writers, back up the database, and execute migrate_v2.sql once.

The migration saves BASELINE images of all existing business rows and every legacy relationship version into the delivery queue before reducing relationships to their current set. After migration, call flush_audit() and confirm the queue is empty and the JSONL files are present. Original manual scores/comments are retained; migration does not silently regrade historical decisions.

Mixed version values are ambiguous because this upload partially changes the old model. The script refuses to guess. In the same connection, explicitly choose the interpretation you know matches the existing data:

```sql
-- Original soft-delete snapshots: the group's greatest version is current.
SET gradeflow.legacy_relation_mode = 'latest';
-- Then execute migrate_v2.sql in this same session.
```

Or, for a database that already contains only current relationships but has inconsistent per-row counters from the partial v2 update:

```sql
SET gradeflow.legacy_relation_mode = 'current';
-- Then execute migrate_v2.sql in this same session.
```

The current mode retains the union of present labels and uses the greatest stored version when the same label appears more than once. Both modes preserve all original rows in BASELINE JSON images. Without an explicit mode, any group with multiple versions aborts and the whole migration rolls back. The chosen session mode is cleared after a successful migration to avoid accidental reuse. Do not use current mode for genuine full historical snapshots unless their union is actually the intended current set.

If your deployed schema was separately edited, compare it with testdata/legacy_schema.sql first; the migration targets that known structure. It is not an automatic merger of unknown schemas. The package checks that audit triggers/outbox are present before executing public business SQL, and refuses unprotected operation. TRUNCATE is rejected because it cannot provide per-row OLD images; use auditable DELETE for that case. Administrative DROP/ALTER and deliberate privileged bypass are outside this application audit guarantee.

If a different database owner installs the schema, grant the runtime role the required business-table privileges plus SELECT/INSERT/DELETE on audit_outbox, sequence usage, and trigger-function execution as appropriate. Do not disable capture triggers to work around a permission error: capture failure intentionally prevents an unaudited business commit.

## Validation

33 automated tests passed against PostgreSQL through PGlite and psycopg. They include regression behavior, all thirteen audited tables, original header preservation, before/after content, actor/request isolation, no audit event on rollback, no business commit on capture failure, file outage/retry, stable replay IDs, interrupted-line recovery, raw writes/cascades, missing-trigger fail-closed behavior, TRUNCATE rejection, formatter errors, two migration modes, and ambiguous-migration rollback.

The suite also tests that successful file delivery empties audit_outbox and current relationship tables have no version column. Native PostgreSQL multi-connection concurrency and the Windows locking branch were not executed; the POSIX file-lock branch was exercised in this environment.

To run on a dedicated PostgreSQL test database, set GRADEFLOW_TEST_DSN and run:

```bash
python -m pip install pytest
python -m pytest -q test_database.py test_audit.py
```

The tests create/drop isolated schemas, not the database itself. No deployed data was modified while preparing this release.

References: [PostgreSQL trigger transaction behavior](https://www.postgresql.org/docs/current/trigger-definition.html), [transaction-local settings](https://www.postgresql.org/docs/current/functions-admin.html), and [row locking](https://www.postgresql.org/docs/current/sql-select.html).
