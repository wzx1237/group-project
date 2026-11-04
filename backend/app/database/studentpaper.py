"""Creation of exam-specific student paper records."""


import psycopg
import logging

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["StudentPaper"]

class StudentPaper:
  """Methods provided to Database; this class does not create its own pool."""

  def add_student_paper(
    self, UID: int, scanned_PDF: str, comments: str | None = None, *, exam_ID: int
  ) -> bool:
    """Add one enrolled student's exam paper without overwriting an existing paper."""
    try:
      with self.get_worker() as cursor:
        # Keep membership locked until the new paper has been committed.
        cursor.execute(
          """
          SELECT en.UID
          FROM enrollment AS en
          JOIN Exam AS e ON e.course_ID = en.course_ID
          WHERE e.exam_ID = %s
            AND en.UID = %s
          FOR SHARE OF en, e
          """,
          (exam_ID, UID)
        )
        if self.get_one(cursor) is None:
          raise ValueError("Student is not enrolled in the exam's course")
        cursor.execute(
          """
          INSERT INTO StudentPaper (exam_ID, UID, scanned_PDF, comments)
          VALUES (%s, %s, %s, %s)
          ON CONFLICT (exam_ID, UID) DO NOTHING
          """,
          (exam_ID, UID, scanned_PDF, comments)
        )
        return cursor.rowcount > 0
    except psycopg.Error as error:
      logger.exception("create student paper failed", extra={"extra": {"UID": UID, "exam_ID": exam_ID}})
      raise

  def update_student_paper(self, UID: int, scanned_PDF: str | None = None, comments: str | None = None, *, exam_ID: int) -> bool:
    """Update the supplied PDF reference and/or comment; return False if missing."""
    if scanned_PDF is None and comments is None:
      raise ValueError('At least one of scanned_PDF or comments must be provided')
    with self.get_worker() as cursor:
      # None means "keep the existing field"; an empty string can clear a comment.
      cursor.execute(
        """
        UPDATE StudentPaper
        SET scanned_PDF = COALESCE(%s, scanned_PDF), comments = COALESCE(%s, comments)
        WHERE UID = %s AND exam_ID = %s
        """,
        (scanned_PDF, comments, UID, exam_ID)
      )
      return cursor.rowcount > 0
