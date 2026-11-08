"""Creation of exam-specific student paper records."""


import psycopg
import logging

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["StudentPaper"]

class StudentPaper:
  """Methods provided to Database; this class does not create its own pool."""

  def add_student_paper(self, UID: str, scanned_PDF: str, comments: str | None=None, *, exam_ID: int) -> bool:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return add_student_paper(conn, UID, scanned_PDF, comments, exam_ID=exam_ID)

  def update_student_paper(self, UID: str, scanned_PDF: str | None=None, comments: str | None=None, *, exam_ID: int) -> bool:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return update_student_paper(conn, UID, scanned_PDF, comments, exam_ID=exam_ID)


def prune_ungraded_papers(conn, exam_id, matched) -> int:
    """Remove unmatched papers only when no saved decision would be lost."""
    return conn.execute(
        """DELETE FROM studentpaper p WHERE p.exam_id = %s AND NOT p.uid = ANY(%s)
        AND NOT EXISTS (SELECT 1 FROM decision d WHERE d.exam_id = p.exam_id AND d.uid = p.uid)""",
        (exam_id, matched),
    ).rowcount


def paper_path(conn, exam_id, uid) -> dict | None:
    """Return the saved scan reference; filesystem authorization belongs to the service."""
    return conn.execute('SELECT scanned_pdf FROM studentpaper WHERE exam_id=%s AND uid=%s', (exam_id, uid)).fetchone()


def sync_scanned_papers(conn, exam_id, uids, scan_paths, course_id) -> int:
    """Upsert matched papers only for enrolled students; preserve unchanged paths."""
    return conn.execute(
        """INSERT INTO studentpaper(exam_id,uid,scanned_pdf)
        SELECT %s,s.uid,s.path FROM unnest(%s::text[],%s::text[]) AS s(uid,path)
        JOIN enrollment en ON en.uid=s.uid AND en.course_id=%s
        ON CONFLICT (exam_id,uid) DO UPDATE SET scanned_pdf=EXCLUDED.scanned_pdf
        WHERE studentpaper.scanned_pdf IS DISTINCT FROM EXCLUDED.scanned_pdf""",
        (exam_id, uids, scan_paths, course_id),
    ).rowcount


def add_student_paper(conn, UID: str, scanned_PDF: str, comments: str | None=None, *, exam_ID: int) -> bool:
    """Add one enrolled student's exam paper without overwriting an existing paper."""
    try:
      with conn.cursor() as cursor:
        # Keep membership locked until the new paper has been committed.
        cursor.execute(
          """
          SELECT en.uid
          FROM enrollment AS en
          JOIN assignment AS e ON e.course_id = en.course_id
          WHERE e.exam_ID = %s
            AND en.uid = %s
          FOR SHARE OF en, e
          """,
          (exam_ID, UID)
        )
        if cursor.fetchone() is None:
          raise ValueError("Student is not enrolled in the exam's course")
        cursor.execute(
          """
          INSERT INTO StudentPaper (exam_ID, uid, scanned_PDF, comments)
          VALUES (%s, %s, %s, %s)
          ON CONFLICT (exam_ID, uid) DO NOTHING
          """,
          (exam_ID, UID, scanned_PDF, comments)
        )
        return cursor.rowcount > 0
    except psycopg.Error as error:
      logger.exception("create student paper failed", extra={"extra": {"UID": UID, "exam_ID": exam_ID}})
      raise


def update_student_paper(conn, UID: str, scanned_PDF: str | None=None, comments: str | None=None, *, exam_ID: int) -> bool:
    """Update the supplied PDF reference and/or comment; return False if missing."""
    if scanned_PDF is None and comments is None:
      raise ValueError('At least one of scanned_PDF or comments must be provided')
    with conn.cursor() as cursor:
      # None means "keep the existing field"; an empty string can clear a comment.
      cursor.execute(
        """
        UPDATE StudentPaper
        SET scanned_PDF = COALESCE(%s, scanned_PDF), comments = COALESCE(%s, comments)
        WHERE uid = %s AND exam_ID = %s
        """,
        (scanned_PDF, comments, UID, exam_ID)
      )
      return cursor.rowcount > 0
