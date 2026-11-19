"""Exam creation, exam lookup, and exams belonging to a course."""


import psycopg
import logging

from app.slugs import unique_slug
from .queries import update_columns

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["Exam"]

class Exam:
  """Methods provided to Database; this class does not create its own pool."""

  def add_exam(self, exam_name: str, course_ID: int) -> int:
    """Create an exam in an existing course and return its generated ID. Its slug is made from the name."""
    try:
      with self.get_worker() as cursor:
        # Slugs are unique across all courses (they name upload folders and templates).
        cursor.execute("SELECT slug FROM assignment")
        slug = unique_slug(exam_name, {row["slug"] for row in cursor.fetchall()})
        cursor.execute(
          """
          INSERT INTO assignment (course_id, exam_name, slug)
          VALUES (%s, %s, %s)
          RETURNING exam_id
          """,
          (course_ID, exam_name, slug)
        )
        return self.get_one(cursor)["exam_id"]
    except psycopg.Error as error:
      logger.exception("create exam failed", extra={"extra": {"course_ID": course_ID}})
      raise

  # Retired: get_assignment(conn, exam_id) returns the full assignment row.
  # def get_exam(self, exam_ID: int) -> Dict[str, Any] | None:
  #   '''
  #   input: the exam ID
  #   output: the exam info, or None if not found
  #   '''
  #   try:
  #     with self.get_worker() as cursor:
  #       cursor.execute(
  #         """
  #         SELECT *
  #         FROM assignment
  #         WHERE exam_id = %s
  #         """, (exam_ID, )
  #       )
  #       return self.get_one(cursor)
  #   except psycopg.Error as error:
  #     logger.exception("query exam by exam_ID failed", extra={"extra": {"exam_ID": exam_ID}})
  #     raise

  # Retired: get_course_exams(conn, course_ids) returns all assignment fields.
  # def get_course_exams(self, course_ID: int) -> List[Dict[str, Any]]:
  #   """Return each exam ID and exam name belonging to one course."""
  #   try:
  #     with self.get_worker() as cursor:
  #       cursor.execute(
  #         """SELECT exam_id, exam_name FROM assignment WHERE course_id = %s ORDER BY exam_id""",
  #         (course_ID, )
  #       )
  #       return self.get_all(cursor)
  #   except psycopg.Error as error:
  #     logger.exception("query exams by course failed", extra={"extra": {"course_ID": course_ID}})
  #     raise


def get_course_exams(conn, course_ids: list[int]) -> list[dict]:
    """All assignment fields for the courses, ordered by due date then exam ID."""
    return conn.execute(
        """SELECT * FROM assignment WHERE course_id = ANY(%s)
        ORDER BY due NULLS LAST, exam_id""",
        (course_ids,),
    ).fetchall()


def assignment_slugs(conn) -> list[dict]:
    """Assignment slugs; return rows in query order."""
    return conn.execute('SELECT slug, course_id FROM assignment').fetchall()


def create_assignment(conn, course_id, title, due, slug, kind, short) -> dict | None:
    """Insert an assignment and return its API fields; duplicate slugs raise UniqueViolation."""
    return conn.execute(
        """INSERT INTO assignment (course_id, exam_name, due, slug, kind, short) VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING exam_id, course_id, slug, exam_name, due, kind, short, status""",
        (course_id, title, due, slug, kind, short),
    ).fetchone()


def delete_assignment(conn, exam_id) -> int:
    """Delete assignment; return the affected row count."""
    return conn.execute('DELETE FROM assignment WHERE exam_id = %s', (exam_id,)).rowcount


def update_assignment_columns(conn, exam_id: int, changes: dict) -> int:
    """Update allowed assignment columns; omitted keys keep their current values."""
    return update_columns(conn, "assignment", "exam_id", exam_id, changes,
                          {"exam_name", "kind", "due", "short"})


def get_assignment(conn, exam_id) -> dict | None:
    """Get assignment; return None when missing."""
    return conn.execute(
        """SELECT * FROM assignment WHERE exam_id = %s""",
        (exam_id,),
    ).fetchone()


def lock_assignment(conn, exam_id) -> dict | None:
    """Lock assignment; return None when missing."""
    return conn.execute('SELECT status, slug FROM assignment WHERE exam_id = %s FOR UPDATE', (exam_id,)).fetchone()


def lock_assignment_for_staff(conn, exam_id, actor) -> dict | None:
    """Lock the assignment and return status/slug/role, or None for a nonmember."""
    return conn.execute(
        """SELECT a.status, a.slug, s.role FROM assignment a
        JOIN course_staff cs USING (course_id) JOIN staff s USING (directory_id)
        WHERE a.exam_id = %s AND cs.directory_id = %s FOR UPDATE OF a""",
        (exam_id, actor),
    ).fetchone()


def lock_course_assignments(conn, course_id) -> list[dict]:
    """Lock course assignments; return rows in query order."""
    return conn.execute(
        """SELECT exam_id FROM assignment WHERE course_id = %s AND status <> 'draft' ORDER BY exam_id FOR UPDATE""",
        (course_id,),
    ).fetchall()


def active_assignments(conn) -> list[dict]:
    """Active assignments; return rows in query order."""
    return conn.execute("SELECT exam_id FROM assignment WHERE status <> 'draft' ORDER BY exam_id").fetchall()


def lock_exam(conn, exam_id) -> int:
    """Lock exam; return the affected row count."""
    return conn.execute('SELECT exam_id FROM assignment WHERE exam_id=%s FOR UPDATE', (exam_id,)).rowcount


def lock_assignment_by_slug(conn, assignment_id, actor) -> dict | None:
    """Lock assignment by slug; return None when missing."""
    return conn.execute(
        """SELECT a.exam_id, a.course_id FROM assignment a JOIN course_staff cs USING(course_id)
        WHERE a.slug=%s AND cs.directory_id=%s ORDER BY a.course_id LIMIT 1 FOR UPDATE OF a""",
        (assignment_id, actor),
    ).fetchone()


def release_status(conn, exam_id) -> dict | None:
    """Release status; return None when missing."""
    return conn.execute('SELECT released_at, status FROM assignment WHERE exam_id=%s', (exam_id,)).fetchone()


SAVE_FILE_PATH = {
    "blank_exam": "UPDATE assignment SET blank_pdf = %s WHERE exam_id = %s",
    "answer_key": "UPDATE assignment SET answer_key_pdf = %s WHERE exam_id = %s",
}

def save_template_path(conn, kind, path, exam_id) -> int:
    """Save a blank-exam or answer-key reference using the fixed template-kind mapping."""
    return conn.execute(SAVE_FILE_PATH[kind], (path, exam_id)).rowcount


def seed_assignment(conn, course_id, title, due, slug, kind, short) -> int:
    """Seed assignment; return the affected row count."""
    return conn.execute(
        """INSERT INTO assignment (course_id, exam_name, due, slug, kind, short) VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (course_id, slug) DO NOTHING""",
        (course_id, title, due, slug, kind, short),
    ).rowcount
