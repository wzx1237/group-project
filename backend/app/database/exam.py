"""Exam creation, exam lookup, and exams belonging to a course."""


import psycopg
import logging
from typing import List, Dict, Any

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["Exam"]

class Exam:
  """Methods provided to Database; this class does not create its own pool."""

  def add_exam(self, exam_name: str, course_ID: int) -> int:
    """Create an exam in an existing course and return its generated ID."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          INSERT INTO Exam (course_ID, exam_name)
          VALUES (%s, %s)
          RETURNING exam_ID
          """,
          (course_ID, exam_name)
        )
        return self.get_one(cursor)["exam_id"]
    except psycopg.Error as error:
      logger.exception("create exam failed", extra={"extra": {"course_ID": course_ID}})
      raise

  def get_exam(self, exam_ID: int) -> Dict[str, Any] | None:
    '''
    input: the exam ID
    output: the exam info, or None if not found
    '''
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          SELECT *
          FROM Exam
          WHERE exam_ID = %s
          """, (exam_ID, )
        )
        return self.get_one(cursor)
    except psycopg.Error as error:
      logger.exception("query exam by exam_ID failed", extra={"extra": {"exam_ID": exam_ID}})
      raise

  def get_course_exams(self, course_ID: int) -> List[Dict[str, Any]]:
    """Return each exam ID and exam name belonging to one course."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          SELECT exam_ID, exam_name
          FROM Exam
          WHERE course_ID = %s
          ORDER BY exam_ID
          """,
          (course_ID, )
        )
        return self.get_all(cursor)
    except psycopg.Error as error:
      logger.exception("query exams by course failed", extra={"extra": {"course_ID": course_ID}})
      raise
