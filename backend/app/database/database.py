"""Shared connection pool, cursor helpers, and the public Database entry point."""


import psycopg
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row
from psycopg.conninfo import make_conninfo
from typing import List, Dict, Any, Iterator, ContextManager
from contextlib import contextmanager
from contextvars import ContextVar

from .audit import Audit
from .course import Course
from .decision import Decision
from .exam import Exam
from .label import Label
from .rubric import Rubric
from .staff import Staff
from .student import Student
from .studentpaper import StudentPaper

__all__ = ["Database"]

class Database(
  Audit,
  Course,
  Decision,
  Exam,
  Label,
  Rubric,
  Staff,
  Student,
  StudentPaper
):
  """One shared pool with methods organized into domain modules."""

  def __init__(
    self, host: str = 'localhost', port: int | str = '5432',
    dbname: str = 'gradeflow', user: str = 'postgres', password: str = '123456'
  ) -> None:
    '''
    Args: 
    Note: that database is for one exam, not for single schema (i.e. Student) and not for all exams
    Update: the note above describes the old design. One database now stores
    multiple exams; pass exam_ID explicitly to exam-specific methods.
    Current schema: students/staff are global; papers and grading are exam-specific.
    '''
    # Initialize request-local audit metadata and the shared delivery lock.
    self._initialize_audit()
    self._active_connection = ContextVar('gradeflow_active_connection', default=None)
    # One shared pool is used by all mixins; retain the uploaded v2 limit of 30.
    self.pool = ConnectionPool(
      conninfo=make_conninfo(
        host=host, port=port, dbname=dbname, user=user, password=password
      ),
      min_size=1,
      max_size=30,
      open=True,
      kwargs={"row_factory": dict_row}    # intentionally change the return type from Tuple to Dict
    )

  def get_connection(self) -> ContextManager[psycopg.Connection[Dict[str, Any]]]:
    return self._reusable_connection()

  @contextmanager
  def _reusable_connection(self):
    connection = self._active_connection.get()
    if connection is None:
      with self._connection() as connection:
        yield connection
    else:
      # A nested method uses a savepoint, not a separate connection or commit.
      with connection.transaction():
        yield connection

  @contextmanager
  def transaction(self) -> Iterator['Database']:
    """Compose existing methods into one commit; keep this scope in one thread."""
    with self._reusable_connection() as connection:
      token = self._active_connection.set(connection)
      try:
        yield self
      finally:
        self._active_connection.reset(token)

  def close(self) -> None:
    """Close the pool when the application shuts down."""
    try:
      if self._audit_schema_seen:
        self._flush_audit_safely()
    finally:
      self.pool.close()

  @contextmanager
  def get_worker(self) -> Iterator[psycopg.Cursor[Dict[str, Any]]]:
    """Yield one cursor; commit on success and roll back on any exception."""
    with self.get_connection() as conn:
      with conn.cursor() as cursor:
        yield cursor

  def get_one(self, cursor: psycopg.Cursor[Dict[str, Any]]) -> Dict[str, Any] | None:
    """Fetch the next row from a cursor that has already executed a query."""
    return cursor.fetchone()

  def get_all(self, cursor: psycopg.Cursor[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fetch the remaining rows from a cursor that has already executed a query."""
    return cursor.fetchall()
