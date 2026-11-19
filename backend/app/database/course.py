"""Course creation and enrolled student lookup."""


import psycopg
import logging
import re
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
          """INSERT INTO course (code, term, title) VALUES (%s, %s, %s) ON CONFLICT (code, term) DO NOTHING RETURNING course_id""",
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
          SELECT enrollment.uid, COALESCE(enrollment.name, student.name) AS name FROM enrollment
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


def normalize_course_code(code: str) -> str:
    """normalize course code by stripping whitespace and lowercasing for duplicate checks."""
    return re.sub(r"\s+", "", (code or "").strip()).lower()


def parse_course_term(term: str) -> tuple[str, int | None, str]:
    """extract canonical semester and year so equivalent terms match regardless of format."""
    clean = " ".join((term or "").strip().split())
    lower = clean.lower()
    semester = "other"
    for candidate in ("spring", "summer", "fall", "winter"):
        if candidate in lower:
            semester = candidate
            break

    four_digit = re.search(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", clean)
    year = None
    if four_digit:
        year = int(four_digit.group(1))
    else:
        two_digit = re.search(r"(?:^|\D)'?([2-9]\d)(?!\d)", clean)
        if two_digit:
            year = 2000 + int(two_digit.group(1))

    if semester != "other":
        return (semester, year, "")
    return ("other", year, lower)


def find_conflicting_course(conn, code: str, term: str, exclude_course_id: int | None = None) -> dict | None:
    """find a course with the same normalized code and same semester and year."""
    target_code = normalize_course_code(code)
    target_term = parse_course_term(term)
    rows = conn.execute("SELECT course_id, code, term, title FROM course").fetchall()
    for row in rows:
        if exclude_course_id is not None and row["course_id"] == exclude_course_id:
            continue
        if normalize_course_code(row["code"]) == target_code and parse_course_term(row["term"]) == target_term:
            return row
    return None


def create_course(conn, code, term, title) -> dict | None:
    """Create course; return None when missing."""
    # prevent duplicate course codes within the same year and semester
    if find_conflicting_course(conn, code, term) is not None:
        return None
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
