"""Course creation and enrolled student lookup."""


import psycopg
from psycopg.rows import dict_row
import logging
from typing import List, Dict, Any

from .queries import update_columns

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["Course"]

class Course:
  """Methods provided to Database; this class does not create its own pool."""

  def create_course(self, code: str, term: str, title: str | None=None) -> int:
    # Compatibility adapter; transaction and audit stay with Database.
    with self.get_connection() as conn:
      return create_course(conn, code, term, title)

  def get_course_enrollment(self, course_id: int) -> List[Dict[str, Any]]:
    """Return enrolled student IDs and names for one course."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          SELECT enrollment.uid, student.name FROM enrollment
          JOIN student ON student.uid = enrollment.uid
          WHERE enrollment.course_id = %s
          ORDER BY enrollment.uid
          """,
          (course_id, )
        )
        return self.get_all(cursor)
    except psycopg.Error as error:
      logger.exception("query enrollment failed", extra={"extra": {"course_id": course_id}})
      raise


def courses_for_staff(conn, directory_id) -> list[dict]:
    # Courses for staff; return rows in query order.
    return conn.execute(
        """SELECT c.*, s.role,
        (SELECT i.name FROM course_staff ic JOIN staff i USING (directory_id)
        WHERE ic.course_id = c.course_id AND i.role = 'instructor'
        ORDER BY (CASE WHEN i.name LIKE '%%Herman%%' THEN 0 ELSE 1 END), i.name LIMIT 1)
        AS instructor
        FROM course c JOIN course_staff cs USING (course_id) JOIN staff s USING (directory_id)
        WHERE cs.directory_id = %s ORDER BY c.course_id""",
        (directory_id,),
    ).fetchall()


def course_code(conn, course_id) -> dict | None:
    # search Course code by course id; return None when missing.
    return conn.execute('SELECT code FROM course WHERE course_id = %s', (course_id,)).fetchone()

# TODO: the function create_course and ensure_course is overlapped (except for the log warning)
# we need to decide whether merge them into one method
def create_course(conn, code, term, title: str | None = None) -> int:
    # Create course; return the course id for the just created course.
    # If the course already exists, log a warning and return the existing course id.
    try:
        # fix bug(2026/11/11): the input conn is not using dict_row
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                INSERT INTO course (code, term, title) VALUES (%s, %s, %s)
                ON CONFLICT (code, term) DO NOTHING RETURNING course_id
                """,
                (code, term, title)
            )
            new_course = cursor.fetchone()
            if new_course is not None:
                return new_course["course_id"]
            cursor.execute("""SELECT course_id FROM course WHERE code = %s AND term = %s""", (code, term))
            existing = cursor.fetchone()
            if existing is None:
                raise RuntimeError(f"course conflicted but not found: code={code!r}, term={term!r}")
            logger.warning(
                "course already exists, reused existing row",
                extra={"extra": {"code": code, "term": term,"course_id": existing["course_id"]}},
            )
            return existing["course_id"]
    except psycopg.Error as error:
        logger.exception("create course failed", extra={"extra": {"code": code, "term": term}})
        raise

def course_row(conn, course_id) -> dict | None:
    # search Course by course id; return None when missing.
    return conn.execute('SELECT * FROM course WHERE course_id = %s', (course_id,)).fetchone()


def update_course_columns(conn, course_id: int, changes: dict) -> int:
    # Update course metadata using an explicit column whitelist.
    return update_columns(conn, "course", "course_id", course_id, changes,
                          {"code", "term", "title", "image"})


def course_by_code(conn, code) -> dict | None:
    # search Course by code; return None when missing.
    return conn.execute('SELECT code FROM course WHERE lower(code) = lower(%s)', (code,)).fetchone()


def ensure_course(conn, code, term) -> int:
    # Ensure course exists: if it's haven't create yet, create it, if exist, return its course id
    conn.execute('INSERT INTO course (code, term) VALUES (%s, %s) ON CONFLICT (code, term) DO NOTHING RETURNING course_id', (code, term))
    course = conn.fetchone()
    if course is not None:
       return course["course_id"]
    # else, the course is already exist
    conn.execute('SELECT course_id FROM course WHERE code = %s AND term = %s', (code, term))
    existing = conn.fetchone()
    if existing is None:
        raise RuntimeError(f"course ensure conflicted but row not found: code={code!r}, term={term!r}")
    return existing["course_id"]


def course_id_by_term(conn, code, term) -> dict | None:
    # search Course id by course code and term; return None when missing.
    return conn.execute('SELECT course_id FROM course WHERE code = %s AND term = %s', (code, term)).fetchone()


def course_exists(conn, course_id: int) -> bool:
    # check whether the given course is existed.
    return conn.execute(
        'SELECT 1 FROM course WHERE course_id = %s', (course_id,)
    ).fetchone() is not None


def get_course_enrollment(conn, course_id: int) -> List[Dict[str, Any]]:
    # Return enrolled student IDs and names for one course.
    try:
      with conn.cursor() as cursor:
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
        return cursor.fetchall()
    except psycopg.Error as error:
      logger.exception("query enrollment failed", extra={"extra": {"course_id": course_id}})
      raise
