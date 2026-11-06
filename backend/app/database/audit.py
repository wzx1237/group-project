"""Durable handoff from committed database changes to append-only JSONL files.

The outbox is a delivery queue, not the history store. Its rows are deleted only
once the corresponding JSON lines have been flushed and fsynced successfully.
"""

from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from threading import RLock
from typing import Iterator
from uuid import uuid4
import logging
import os

logger = logging.getLogger(__name__)
__all__ = ["Audit"]


@contextmanager
def _directory_lock(directory: Path):
  """Serialize appenders across processes, including Windows application workers."""
  directory.mkdir(parents=True, exist_ok=True)
  with (directory / '.audit.lock').open('a+b') as handle:
    # Windows locks a byte range; keep a byte available even in a new lock file.
    handle.seek(0, os.SEEK_END)
    if handle.tell() == 0:
      handle.write(b'\0')
      handle.flush()
    handle.seek(0)
    if os.name == 'nt':
      import msvcrt
      msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
      try:
        yield
      finally:
        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    else:
      import fcntl
      fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
      try:
        yield
      finally:
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


class Audit:
  """Audit context, transaction checks, and JSON file delivery for Database."""

  def _initialize_audit(self) -> None:
    # An environment variable keeps the existing Database constructor unchanged.
    self._audit_directory = Path(os.environ.get('GRADEFLOW_AUDIT_DIR', 'logs/audit')).resolve()
    self._audit_metadata = ContextVar('gradeflow_audit_metadata', default=None)
    self._audit_flush_lock = RLock()
    self._audit_schema_seen = False

  @contextmanager
  def audit_context(self, actor_ID: str | None = None, request_ID: str | None = None) -> Iterator[None]:
    """Attach authenticated caller/request metadata without changing business APIs."""
    metadata = dict(self._audit_metadata.get() or {})
    if actor_ID is not None:
      metadata['actor_id'] = actor_ID
    if request_ID is not None:
      metadata['request_id'] = request_ID
    metadata.setdefault('request_id', str(uuid4()))
    token = self._audit_metadata.set(metadata)
    try:
      yield
    finally:
      # ContextVar prevents one concurrent request from inheriting another actor.
      self._audit_metadata.reset(token)

  def _check_audit_schema(self, conn) -> None:
    """Fail before business SQL if the required audit triggers are not installed."""
    row = conn.execute("""
      SELECT to_regclass('audit_outbox') IS NOT NULL AS has_outbox,
             current_setting('session_replication_role') AS replication_role,
             count(*) FILTER (WHERE t.tgname = 'audit_change'
                               AND p.proname = 'audit_capture_change') AS row_triggers,
             count(*) FILTER (WHERE t.tgname = 'audit_no_truncate'
                               AND p.proname = 'audit_reject_truncate') AS truncate_triggers
      FROM pg_trigger AS t JOIN pg_proc AS p ON p.oid = t.tgfoid
      WHERE NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
        AND t.tgrelid = ANY (ARRAY[
          'staff'::regclass, 'course'::regclass, 'course_staff'::regclass,
          'student'::regclass, 'enrollment'::regclass, 'assignment'::regclass,
          'StudentPaper'::regclass, 'Rubric'::regclass, 'Label'::regclass,
          'Mapping'::regclass, 'Decision'::regclass, 'Rubric_Label'::regclass,
          'Decision_Label'::regclass
        ])
      """).fetchone()
    if (not row['has_outbox'] or row['replication_role'] != 'origin'
        or row['row_triggers'] != 13 or row['truncate_triggers'] != 13):
      raise RuntimeError('Audit schema is missing or disabled; run the supplied schema/migration first')

  @contextmanager
  def _connection(self):
    """Commit the business transaction before attempting any audit file writes."""
    with self.pool.connection() as conn:
      self._check_audit_schema(conn)
      self._audit_schema_seen = True
      metadata = self._audit_metadata.get() or {}
      # Transaction-local settings are cleared on commit/rollback and pool reuse.
      conn.execute(
        """
        SELECT set_config('gradeflow.actor_id', %s, true),
               set_config('gradeflow.request_id', %s, true)
        """, (metadata.get('actor_id') or '', metadata.get('request_id') or str(uuid4())))
      yield conn
    # Reaching this line means the transaction has committed successfully.
    self._flush_audit_safely()

  def _flush_audit_safely(self) -> None:
    try:
      self.flush_audit()
    except Exception:
      # A file failure cannot undo a transaction that already committed. Keep the
      # outbox and let a later request/operator retry, rather than report rollback.
      logger.exception('Audit file delivery deferred; committed events remain in audit_outbox')

  def _write_audit_rows(self, rows) -> None:
    """Append complete JSON lines, repair an interrupted tail, then sync to disk."""
    grouped = {}
    for row in rows:
      grouped.setdefault(row['day'], []).append(row['line'])
    for day, records in grouped.items():
      path = self._audit_directory / ('audit-' + day + '.jsonl')
      with path.open('a+b') as handle:
        # A process crash can leave an incomplete last line. The outbox still
        # contains that event, so discarding only the incomplete tail is safe.
        handle.seek(0, os.SEEK_END)
        size = handle.tell()
        if size:
          handle.seek(size - 1)
          if handle.read(1) != b'\n':
            end = size
            while end:
              start = max(0, end - 65536)
              handle.seek(start)
              data = handle.read(end - start)
              last_newline = data.rfind(b'\n')
              if last_newline >= 0:
                handle.truncate(start + last_newline + 1)
                break
              end = start
            else:
              handle.truncate(0)
        handle.seek(0, os.SEEK_END)
        for record in records:
          # PostgreSQL constructs this JSON text; NUMERIC values are not converted
          # to binary floats or reformatted by the Python exporter.
          handle.write(record.encode('utf-8') + b'\n')
        handle.flush()
        os.fsync(handle.fileno())
    if os.name != 'nt':
      # Persist newly created filenames before acknowledging their queue records.
      descriptor = os.open(self._audit_directory, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
      try:
        os.fsync(descriptor)
      finally:
        os.close(descriptor)

  def flush_audit(self, batch_size: int = 500) -> int:
    """Deliver pending committed events to JSONL; return acknowledged queue rows."""
    if isinstance(batch_size, bool) or not isinstance(batch_size, int) or batch_size <= 0:
      raise ValueError('batch_size must be a positive integer')
    delivered = 0
    with self._audit_flush_lock, _directory_lock(self._audit_directory):
      # Use the raw pool, not get_connection(), to avoid recursively exporting.
      with self.pool.connection() as conn:
        cutoff = conn.execute('SELECT COALESCE(MAX(event_id), 0) AS last FROM audit_outbox').fetchone()['last']
      while cutoff:
        with self.pool.connection() as conn:
          rows = conn.execute("""
            SELECT event_id,
                   to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                   jsonb_build_object(
                     'event_id', event_uuid::text,
                     'timestamp', to_char(occurred_at AT TIME ZONE 'UTC',
                                          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                     'database', current_database(), 'schema', schema_name,
                     'transaction_id', transaction_id::text, 'table', table_name,
                     'operation', operation, 'row_key', row_key,
                     'old_data', old_data, 'new_data', new_data,
                     'actor_id', actor_id, 'request_id', request_id, 'db_user', db_user
                   )::text AS line
            FROM audit_outbox WHERE event_id <= %s
            ORDER BY event_id LIMIT %s FOR UPDATE SKIP LOCKED
            """, (cutoff, batch_size)).fetchall()
          if not rows:
            break
          self._write_audit_rows(rows)
          # File delivery has succeeded. A crash before this commit can replay an
          # event, so event_id is stable and consumers can deduplicate by that ID.
          ids = [row['event_id'] for row in rows]
          conn.execute('DELETE FROM audit_outbox WHERE event_id = ANY(%s)', (ids,))
        delivered += len(rows)
    return delivered
