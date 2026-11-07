"""Global student identity, paper-aware lookup, and course enrollment."""


import psycopg
import logging
from typing import Dict, Any

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["Student"]

class Student:
  """Methods provided to Database; this class does not create its own pool."""

  def get_student(self, UID: str, *, exam_ID: int | None = None) -> Dict[str, Any] | None:
    """Return global student data, or student data joined to one exam paper."""
    try:
      with self.get_worker() as cursor:
        if exam_ID is None:
          cursor.execute(
            """SELECT uid, name, email FROM student WHERE uid = %s""",
            (UID, )
          )
        else:
          # Student identity is global; the PDF and comments belong to one exam.
          cursor.execute(
            """
            SELECT s.uid, s.name, s.email, p.exam_ID, p.scanned_PDF, p.comments
            FROM student AS s
            JOIN StudentPaper AS p ON p.uid = s.uid
            WHERE s.uid = %s
              AND p.exam_ID = %s
            """,
            (UID, exam_ID)
          )
        return self.get_one(cursor)
    except psycopg.Error as error:
      logger.exception("query student UID failed", extra={"extra": {"UID": UID}})
      raise

  def add_student(self, UID: str, name: str, email: str | None = None) -> bool:
    """Create a global student; return False if the UID already exists."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          INSERT INTO student (uid, name, email)
          VALUES (%s, %s, %s)
          ON CONFLICT (uid) DO NOTHING
          """,
          (UID, name, email)
        )
        return cursor.rowcount > 0
    except psycopg.Error as error:
      logger.exception("create student failed", extra={"extra": {"UID": UID}})
      raise

  def add_student_to_course(self, course_ID: int, UID: str) -> bool:
    """Enroll an existing student using the common persistence function."""
    with self.get_connection() as conn:
      return enroll_student(conn, course_ID, UID) > 0


def lock_exam_enrollment(conn, exam_id, uid) -> dict | None:
    """Lock exam enrollment; return None when missing."""
    return conn.execute(
        """SELECT en.uid FROM enrollment en JOIN assignment e USING(course_id)
        WHERE e.exam_id=%s AND en.uid=%s FOR SHARE OF en""",
        (exam_id, uid),
    ).fetchone()


def upsert_roster_student(conn, uid, name, email) -> dict | None:
    """Upsert roster student; return None when missing."""
    return conn.execute(
        """INSERT INTO student (uid, name, email) VALUES (%s, %s, %s)
        ON CONFLICT (uid) DO UPDATE SET
        name = EXCLUDED.name,
        email = COALESCE(EXCLUDED.email, student.email)
        RETURNING uid, name, directory_id, email""",
        (uid, name, email),
    ).fetchone()


def enroll_with_section(conn, course_id, uid, section) -> int:
    """Enroll with section; return the affected row count."""
    return conn.execute(
        """INSERT INTO enrollment (course_id, uid, section) VALUES (%s, %s, %s)
        ON CONFLICT (course_id, uid) DO UPDATE SET
        section = COALESCE(EXCLUDED.section, enrollment.section)""",
        (course_id, uid, section),
    ).rowcount


def enroll_student(conn, course_id, uid) -> int:
    """Enroll student; return the affected row count."""
    return conn.execute(
        """INSERT INTO enrollment (course_id, uid) VALUES (%s, %s) ON CONFLICT DO NOTHING""",
        (course_id, uid),
    ).rowcount


def seed_student(conn, uid, name, directory_id) -> int:
    """Seed student; return the affected row count."""
    return conn.execute(
        """INSERT INTO student (uid, name, directory_id) VALUES (%s, %s, %s)
        ON CONFLICT (uid) DO UPDATE SET name = EXCLUDED.name, directory_id = EXCLUDED.directory_id""",
        (uid, name, directory_id),
    ).rowcount
