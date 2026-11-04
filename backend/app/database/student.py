"""Global student identity, paper-aware lookup, and course enrollment."""


import psycopg
import logging
from typing import Dict, Any

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["Student"]

class Student:
  """Methods provided to Database; this class does not create its own pool."""

  def get_student(self, UID: int | str, *, exam_ID: int | None = None) -> Dict[str, Any] | None:
    """Return global student data, or student data joined to one exam paper."""
    if not isinstance(UID, int):
      try:
        UID = int(UID)
      except (ValueError, TypeError):
        logger.exception("face error when convert %s to int", UID)
        return None
    try:
      with self.get_worker() as cursor:
        if exam_ID is None:
          cursor.execute(
            """
            SELECT UID, name, email
            FROM student
            WHERE UID = %s
            """,
            (UID, )
          )
        else:
          # Student identity is global; the PDF and comments belong to one exam.
          cursor.execute(
            """
            SELECT s.UID, s.name, s.email, p.exam_ID, p.scanned_PDF, p.comments
            FROM student AS s
            JOIN StudentPaper AS p ON p.UID = s.UID
            WHERE s.UID = %s
              AND p.exam_ID = %s
            """,
            (UID, exam_ID)
          )
        return self.get_one(cursor)
    except psycopg.Error as error:
      logger.exception("query student UID failed", extra={"extra": {"UID": UID}})
      raise

  def add_student(self, UID: int, name: str, email: str | None = None) -> bool:
    """Create a global student; return False if the UID already exists."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          INSERT INTO student (UID, name, email)
          VALUES (%s, %s, %s)
          ON CONFLICT (UID) DO NOTHING
          """,
          (UID, name, email)
        )
        return cursor.rowcount > 0
    except psycopg.Error as error:
      logger.exception("create student failed", extra={"extra": {"UID": UID}})
      raise

  def add_student_to_course(self, course_ID: int, UID: int) -> bool:
    """Enroll an existing student; return False for an existing enrollment."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          INSERT INTO enrollment (course_ID, UID)
          VALUES (%s, %s)
          ON CONFLICT (course_ID, UID) DO NOTHING
          """,
          (course_ID, UID)
        )
        return cursor.rowcount > 0
    except psycopg.Error as error:
      logger.exception("enroll student failed", extra={"extra": {"UID": UID, "course_ID": course_ID}})
      raise
