"""Current rubric-label relationships; durable history is exported as JSONL."""
from . import decision as decision_queries
import logging
import psycopg
from typing import List, Dict, Any
logger = logging.getLogger(__name__)
__all__ = ["Rubric"]

class Rubric:
  """Business methods sharing Database transaction and audit handling."""

  def get_rubric(self, QID: str, *, exam_ID: int) -> Dict[str, Any] | None:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return get_rubric(conn, QID, exam_ID=exam_ID)

  def get_rubric_labels(self, QID: str, *, exam_ID: int) -> List[Dict[str, Any]]:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return get_rubric_labels(conn, QID, exam_ID=exam_ID)

  def add_rubric_label(self, QID: str, label: int, *, exam_ID: int) -> int:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return add_rubric_label(conn, QID, label, exam_ID=exam_ID)

  def add_rubric_labels(self, QID: str, labels: List[int], *, exam_ID: int) -> bool:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return add_rubric_labels(conn, QID, labels, exam_ID=exam_ID)

  def remove_rubric_label(self, QID: str, Label_ID: int, *, exam_ID: int) -> bool:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return remove_rubric_label(conn, QID, Label_ID, exam_ID=exam_ID)

  # Retired: the maintained question/label editing APIs include score synchronization.
  # def update_rubric(self, QID: str, Label_ID: int, old_label_ID: int | None = None, *, exam_ID: int) -> bool:
  #   """Replace one current relationship without changing the Label definition."""
  #   with self.get_worker() as cursor:
  #     self._lock_rubric(cursor, QID, exam_ID)
  #     cursor.execute('SELECT Label_ID FROM Rubric_Label WHERE exam_ID = %s AND QID = %s', (exam_ID, QID))
  #     current = [row['label_id'] for row in self.get_all(cursor)]
  #     if old_label_ID is None:
  #       if len(current) != 1:
  #         raise ValueError('Please specify old_label_ID when the rubric does not have exactly one label')
  #       old_label_ID = current[0]
  #     if old_label_ID not in current:
  #       raise ValueError('old_label_ID is not in the current rubric')
  #     if Label_ID == old_label_ID:
  #       return True
  #     if Label_ID in current:
  #       raise ValueError('The replacement label is already in the current rubric')
  #     # UPDATE supplies both OLD and NEW images to the audit trigger automatically.
  #     cursor.execute('UPDATE Rubric_Label SET Label_ID = %s WHERE exam_ID = %s AND QID = %s AND Label_ID = %s',
  #                    (Label_ID, exam_ID, QID, old_label_ID))
  #     return cursor.rowcount > 0

  def _lock_rubric(self, cursor, QID: str, exam_ID: int) -> None:
    """Compatibility adapter; transaction and audit stay with Database."""
    return _lock_rubric(cursor.connection, QID, exam_ID)

  def add_question(self, QID, title, grading_method, total_scores, region=None, scoring='add', *, exam_ID):
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return add_question(conn, QID, title, grading_method, total_scores, region, scoring, exam_ID=exam_ID)

  def edit_question(self, QID, title, grading_method, total_scores, region=None, scoring='add', *, exam_ID):
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return edit_question(conn, QID, title, grading_method, total_scores, region, scoring, exam_ID=exam_ID)

  def remove_question(self, QID, *, exam_ID):
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return remove_question(conn, QID, exam_ID=exam_ID)


def lock_question(conn, exam_id, qid, *, edit=False) -> dict | None:
    """Lock question; return None when missing."""
    lock = 'FOR NO KEY UPDATE' if edit else 'FOR SHARE'
    return conn.execute('SELECT * FROM rubric WHERE exam_id=%s AND qid=%s ' + lock, (exam_id, qid)).fetchone()


def question_row(conn, exam_id, qid) -> dict | None:
    """Question row; return None when missing."""
    return conn.execute('SELECT * FROM rubric WHERE exam_id=%s AND qid=%s', (exam_id, qid)).fetchone()


def question_ids(conn, exam_id) -> list[dict]:
    """Question ids; return rows in query order."""
    return conn.execute('SELECT qid FROM rubric WHERE exam_id=%s ORDER BY qid', (exam_id,)).fetchall()


def insert_question(conn, exam_id, qid, grading_method, total_scores) -> int:
    """Insert question; return the affected row count."""
    return conn.execute(
        """INSERT INTO rubric(exam_id,qid,grading_method,total_scores) VALUES(%s,%s,%s,%s)""",
        (exam_id, qid, grading_method, total_scores),
    ).rowcount


def resolve_assignment_exam_id(conn, assignment_id: str | None) -> int | None:
    """Resolve an assignment slug or numeric ID to its exam_id without mutating data."""
    if not assignment_id:
        return None
    if assignment_id.isdigit():
        return int(assignment_id)
    row = conn.execute('SELECT exam_id FROM assignment WHERE slug = %s', (assignment_id,)).fetchone()
    return row['exam_id'] if row else None


def import_sources(conn, actor: str, exclude_exam_id: int | None = None) -> list[dict]:
    """List assignments with a rubric in courses the actor staffs, excluding `exclude_exam_id`."""
    return conn.execute(
        """SELECT a.exam_id, a.slug AS assignment_id, a.exam_name AS title, a.kind, a.due, a.status,
                  c.course_id, c.code AS course_code, c.term AS course_term, c.title AS course_title,
                  (SELECT count(*) FROM rubric r WHERE r.exam_id = a.exam_id AND strpos(r.qid, '.') = 0) AS question_count,
                  (SELECT count(*) FROM gradable_question gq WHERE gq.exam_id = a.exam_id) AS gradable_count,
                  (SELECT count(*) FROM rubric_label rl JOIN label l USING (exam_id, label_id)
                   WHERE rl.exam_id = a.exam_id AND l.retired_at IS NULL) AS criteria_count,
                  COALESCE((SELECT sum(gq.total_scores) FROM gradable_question gq WHERE gq.exam_id = a.exam_id), 0) AS total_points
           FROM assignment a
           JOIN course c USING (course_id)
           JOIN course_staff cs USING (course_id)
           WHERE cs.directory_id = %s
             AND (%s::int IS NULL OR a.exam_id <> %s)
             AND EXISTS (SELECT 1 FROM rubric r WHERE r.exam_id = a.exam_id)
           ORDER BY c.course_id DESC, a.due DESC NULLS LAST, a.exam_id DESC""",
        (actor, exclude_exam_id, exclude_exam_id),
    ).fetchall()


def exam_rubric_rows(conn, exam_id: int) -> list[dict]:
    """Return all rubric question rows for an exam."""
    return conn.execute('SELECT * FROM rubric WHERE exam_id = %s ORDER BY qid', (exam_id,)).fetchall()


def exam_active_labels(conn, exam_id: int) -> list[dict]:
    """Return active (non-retired) criteria linked to each question of an exam."""
    return conn.execute(
        """SELECT rl.qid, l.label_id, l.title, l.description, l.deduction
           FROM rubric_label rl
           JOIN label l USING (exam_id, label_id)
           WHERE rl.exam_id = %s AND l.retired_at IS NULL
           ORDER BY rl.qid, l.label_id""",
        (exam_id,),
    ).fetchall()


def gradable_qids(conn, exam_id: int) -> set[str]:
    """Return QIDs of questions graded on their own (without subquestions)."""
    rows = conn.execute('SELECT qid FROM gradable_question WHERE exam_id = %s', (exam_id,)).fetchall()
    return {row['qid'] for row in rows}


def exam_has_decisions(conn, exam_id: int) -> bool:
    """Return whether the exam already holds any grading decisions."""
    row = conn.execute('SELECT EXISTS (SELECT 1 FROM decision WHERE exam_id = %s) AS found', (exam_id,)).fetchone()
    return bool(row and row['found'])


def question_has_used_labels(conn, exam_id: int, qid: str) -> bool:
    """Return whether any criterion linked to `qid` is referenced by decisions or regrade queues."""
    row = conn.execute(
        """SELECT EXISTS (
             SELECT 1 FROM rubric_label rl
             WHERE rl.exam_id = %s AND rl.qid = %s
               AND (
                 EXISTS (SELECT 1 FROM decision_label dl WHERE dl.exam_id = rl.exam_id AND dl.label_id = rl.label_id)
                 OR EXISTS (SELECT 1 FROM regrade_queue rq WHERE rq.exam_id = rl.exam_id AND rq.label_id = rl.label_id)
               )
           ) AS used""",
        (exam_id, qid),
    ).fetchone()
    return bool(row and row['used'])


def clear_exam_rubric(conn, exam_id: int) -> None:
    """Delete all rubric questions and labels for an exam (rubric first so regrade_queue cascades cleanly)."""
    conn.execute('DELETE FROM rubric WHERE exam_id = %s', (exam_id,))
    conn.execute('DELETE FROM label WHERE exam_id = %s', (exam_id,))


def clear_question_labels(conn, exam_id: int, qid: str) -> None:
    """Unlink criteria from `qid` and delete any resulting orphaned unused labels."""
    conn.execute(
        """WITH removed AS (
             DELETE FROM rubric_label WHERE exam_id = %s AND qid = %s RETURNING label_id
           )
           DELETE FROM label l
           USING removed r
           WHERE l.exam_id = %s AND l.label_id = r.label_id
             AND NOT EXISTS (SELECT 1 FROM rubric_label other WHERE other.exam_id = l.exam_id AND other.label_id = l.label_id)
             AND NOT EXISTS (SELECT 1 FROM decision_label dl WHERE dl.exam_id = l.exam_id AND dl.label_id = l.label_id)
             AND NOT EXISTS (SELECT 1 FROM regrade_queue rq WHERE rq.exam_id = l.exam_id AND rq.label_id = l.label_id)""",
        (exam_id, qid, exam_id),
    )
