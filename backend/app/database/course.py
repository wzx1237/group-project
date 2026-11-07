"""Course creation and enrolled student lookup."""


import psycopg
import logging
from typing import List, Dict, Any

from .queries import update_columns

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["Course"]

class Course:
  """Methods provided to Database; this class does not create its own pool."""

  def add_course(self, code: str, term: str, title: str | None = None) -> int:
    """Create a course offering and return its generated course ID."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          INSERT INTO course (code, term, title)
          VALUES (%s, %s, %s)
          RETURNING course_id
          """,
          (code, term, title)
        )
        return self.get_one(cursor)["course_id"]
    except psycopg.Error as error:
      logger.exception("create course failed", extra={"extra": {"code": code, "term": term}})
      raise

  def get_course_enrollment(self, course_id: int) -> List[Dict[str, Any]]:
    """Return enrolled student IDs and names for one course."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          SELECT en.uid, s.name
          FROM enrollment AS en
          JOIN student AS s ON s.uid = en.uid
          WHERE en.course_id = %s
          ORDER BY en.uid
          """,
          (course_id, )
        )
        return self.get_all(cursor)
    except psycopg.Error as error:
      logger.exception("query enrollment failed", extra={"extra": {"course_id": course_id}})
      raise


def courses_for_staff(conn, directory_id) -> list[dict]:
    """Courses for staff; return rows in query order."""
    return conn.execute(
        """SELECT c.*, s.role,
        (SELECT i.name FROM course_staff ic JOIN staff i USING (directory_id)
        WHERE ic.course_id = c.course_id AND i.role = 'instructor'
        ORDER BY (CASE WHEN i.name LIKE '%%Herman%%' THEN 0 ELSE 1 END), i.name LIMIT 1) AS instructor
        FROM course c JOIN course_staff cs USING (course_id) JOIN staff s USING (directory_id)
        WHERE cs.directory_id = %s ORDER BY c.course_id""",
        (directory_id,),
    ).fetchall()


def course_code(conn, course_id) -> dict | None:
    """Course code; return None when missing."""
    return conn.execute('SELECT code FROM course WHERE course_id = %s', (course_id,)).fetchone()


def create_course(conn, code, term, title) -> dict | None:
    """Create course; return None when missing."""
    return conn.execute(
        """INSERT INTO course (code, term, title) VALUES (%s, %s, %s)
        ON CONFLICT (code, term) DO NOTHING RETURNING course_id""",
        (code, term, title),
    ).fetchone()


def course_row(conn, course_id) -> dict | None:
    """Course row; return None when missing."""
    return conn.execute('SELECT * FROM course WHERE course_id = %s', (course_id,)).fetchone()




def update_course_columns(conn, course_id: int, changes: dict) -> int:
    """Update course metadata using an explicit column whitelist."""
    return update_columns(conn, "course", "course_id", course_id, changes,
                          {"code", "term", "title", "image"})


def course_id_row(conn, course_id) -> dict | None:
    """Course id row; return None when missing."""
    return conn.execute('SELECT course_id FROM course WHERE course_id = %s', (course_id,)).fetchone()


def course_by_code(conn, code) -> dict | None:
    """Course by code; return None when missing."""
    return conn.execute('SELECT code FROM course WHERE lower(code) = lower(%s)', (code,)).fetchone()


def ensure_course(conn, code, term) -> int:
    """Ensure course; return the affected row count."""
    return conn.execute('INSERT INTO course (code, term) VALUES (%s, %s) ON CONFLICT DO NOTHING', (code, term)).rowcount


def course_id_by_term(conn, code, term) -> dict | None:
    """Course id by term; return None when missing."""
    return conn.execute('SELECT course_id FROM course WHERE code = %s AND term = %s', (code, term)).fetchone()
