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
          # student identity is global, while course enrollment can override name/email for one course.
          cursor.execute(
            """
            SELECT s.uid, COALESCE(en.name, s.name) AS name,
                   CASE WHEN en.name IS NOT NULL THEN en.email ELSE s.email END AS email,
                   p.exam_ID, p.scanned_PDF, p.comments
            FROM student AS s
            JOIN StudentPaper AS p ON p.uid = s.uid
            LEFT JOIN assignment AS e ON e.exam_id = p.exam_ID
            LEFT JOIN enrollment AS en ON en.course_id = e.course_id AND en.uid = s.uid
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


def upsert_roster_student(conn, uid, name, email, *, course_id=None) -> dict | None:
    """ensure a student row exists without overwriting another course's student record."""
    conn.execute(
        """INSERT INTO student (uid, name, email) VALUES (%s, %s, %s)
        ON CONFLICT (uid) DO NOTHING""",
        (uid, name, email),
    )
    # only update global student fields if this uid is not enrolled in another course
    if course_id is not None:
        conn.execute(
            """UPDATE student SET name = %s, email = COALESCE(%s, student.email)
            WHERE uid = %s
              AND NOT EXISTS (SELECT 1 FROM enrollment en WHERE en.uid = %s AND en.course_id <> %s)""",
            (name, email, uid, uid, course_id),
        )
    return conn.execute(
        """SELECT uid, name, directory_id, email FROM student WHERE uid = %s""",
        (uid,),
    ).fetchone()


def enroll_with_section(conn, course_id, uid, section, name=None, email=None) -> int:
    """Enroll with section; return the affected row count."""
    return conn.execute(
        """INSERT INTO enrollment (course_id, uid, section, name, email) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (course_id, uid) DO UPDATE SET
        section = COALESCE(EXCLUDED.section, enrollment.section),
        name = COALESCE(EXCLUDED.name, enrollment.name),
        email = COALESCE(EXCLUDED.email, enrollment.email)""",
        (course_id, uid, section, name, email),
    ).rowcount


def enroll_student(conn, course_id, uid, name=None, email=None) -> int:
    """Enroll student; return the affected row count."""
    return conn.execute(
        """INSERT INTO enrollment (course_id, uid, name, email) VALUES (%s, %s, %s, %s)
        ON CONFLICT (course_id, uid) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, enrollment.name),
        email = COALESCE(EXCLUDED.email, enrollment.email)""",
        (course_id, uid, name, email),
    ).rowcount


def course_student(conn, course_id, uid) -> dict | None:
    """return the course-scoped student record for one enrollment."""
    return conn.execute(
        """SELECT s.uid, COALESCE(en.name, s.name) AS name, s.directory_id,
                  CASE WHEN en.name IS NOT NULL THEN en.email ELSE s.email END AS email,
                  en.section
        FROM enrollment en
        JOIN student s USING (uid)
        WHERE en.course_id = %s AND en.uid = %s""",
        (course_id, uid),
    ).fetchone()


def seed_student(conn, uid, name, directory_id) -> int:
    """Seed student; return the affected row count."""
    return conn.execute(
        """INSERT INTO student (uid, name, directory_id) VALUES (%s, %s, %s)
        ON CONFLICT (uid) DO UPDATE SET
        name = CASE WHEN EXISTS (SELECT 1 FROM enrollment en WHERE en.uid = student.uid)
                    THEN student.name ELSE EXCLUDED.name END,
        directory_id = COALESCE(EXCLUDED.directory_id, student.directory_id)""",
        (uid, name, directory_id),
    ).rowcount
