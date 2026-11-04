"""Course creation and enrolled student lookup."""


import psycopg
import logging
from typing import List, Dict, Any

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
          RETURNING course_ID
          """,
          (code, term, title)
        )
        return self.get_one(cursor)["course_id"]
    except psycopg.Error as error:
      logger.exception("create course failed", extra={"extra": {"code": code, "term": term}})
      raise

  def get_course_enrollment(self, course_ID: int) -> List[Dict[str, Any]]:
    """Return enrolled student IDs and names for one course."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          SELECT en.UID, s.name
          FROM enrollment AS en
          JOIN student AS s ON s.UID = en.UID
          WHERE en.course_ID = %s
          ORDER BY en.UID
          """,
          (course_ID, )
        )
        return self.get_all(cursor)
    except psycopg.Error as error:
      logger.exception("query enrollment failed", extra={"extra": {"course_ID": course_ID}})
      raise
