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


def get_rubric(conn, QID: str, *, exam_ID: int) -> Dict[str, Any] | None:
    """Return one full question using the common query and audited connection."""
    return question_row(conn, exam_ID, QID)


def get_rubric_labels(conn, QID: str, *, exam_ID: int) -> List[Dict[str, Any]]:
    """Return the current labels and question ID; history lives in audit JSONL."""
    with conn.cursor() as cursor:
      cursor.execute(
        """
        SELECT l.*, rl.QID FROM Rubric_Label AS rl JOIN Label AS l
        ON (l.exam_ID, l.Label_ID) = (rl.exam_ID, rl.Label_ID)
        WHERE rl.exam_ID = %s AND rl.QID = %s ORDER BY l.Label_ID
        """,
        (exam_ID, QID)
      )
      return cursor.fetchall()


def add_rubric_label(conn, QID: str, label: int, *, exam_ID: int) -> int:
    """Append one current label; a duplicate returns its ID without another write."""
    with conn.cursor() as cursor:
      _lock_rubric(conn, QID, exam_ID)
      # The trigger records the inserted row only if the relationship is new.
      cursor.execute(
        """
        INSERT INTO Rubric_Label (exam_ID, QID, Label_ID) VALUES (%s, %s, %s)
        ON CONFLICT (exam_ID, QID, Label_ID) DO NOTHING
        """,
        (exam_ID, QID, label)
      )
      return label


def add_rubric_labels(conn, QID: str, labels: List[int], *, exam_ID: int) -> bool:
    """Replace the current label set, including clearing it with an empty list."""
    if len(labels) != len(set(labels)):
      raise ValueError('labels must not contain duplicates')
    with conn.cursor() as cursor:
      _lock_rubric(conn, QID, exam_ID)
      # Delete/insert and their before/after audit rows share this one transaction.
      cursor.execute('DELETE FROM Rubric_Label WHERE exam_ID = %s AND QID = %s', (exam_ID, QID))
      if labels:
        cursor.executemany(
          'INSERT INTO Rubric_Label (exam_ID, QID, Label_ID) VALUES (%s, %s, %s)',
          [(exam_ID, QID, label) for label in labels]
        )
      return True


def remove_rubric_label(conn, QID: str, Label_ID: int, *, exam_ID: int) -> bool:
    """Delete one current label and report whether a relationship was removed."""
    with conn.cursor() as cursor:
      _lock_rubric(conn, QID, exam_ID)
      # Removing the last label is safe because no older relationship rows remain.
      cursor.execute(
        'DELETE FROM Rubric_Label WHERE exam_ID = %s AND QID = %s AND Label_ID = %s',
        (exam_ID, QID, Label_ID)
      )
      return cursor.rowcount > 0


def _lock_rubric(conn, QID: str, exam_ID: int) -> None:
    """The parent row is a stable lock even when its current label set is empty."""
    with conn.cursor() as cursor:
      cursor.execute(
        """
        SELECT QID FROM Rubric WHERE exam_ID = %s AND QID = %s
        FOR NO KEY UPDATE
        """,
        (exam_ID, QID)
      )
      if cursor.fetchone() is None:
        raise ValueError(f"Rubric {QID} does not exist")


def add_question(conn, QID, title, grading_method, total_scores, region=None, scoring='add', *, exam_ID):
    """Create a question independently of its reusable label relationships."""
    from psycopg.types.json import Jsonb
    with conn.cursor() as cursor:
      cursor.execute('INSERT INTO rubric(exam_id,qid,title,grading_method,total_scores,region,scoring) VALUES(%s,%s,%s,%s,%s,%s,%s)',
                     (exam_ID, QID, title, grading_method, total_scores, Jsonb(region), scoring))


def edit_question(conn, QID, title, grading_method, total_scores, region=None, scoring='add', *, exam_ID):
    """Points and scoring decide every score, so saved scores for this question are recalculated."""
    from psycopg.types.json import Jsonb
    with conn.cursor() as cursor:
      cursor.execute('SELECT exam_id FROM assignment WHERE exam_id=%s FOR UPDATE', (exam_ID,))
      cursor.execute('UPDATE rubric SET title=%s,grading_method=%s,total_scores=%s,region=%s,scoring=%s WHERE exam_id=%s AND qid=%s',
                     (title, grading_method, total_scores, Jsonb(region), scoring, exam_ID, QID))
      changed = cursor.rowcount > 0
      cursor.execute('SELECT record_id FROM decision WHERE exam_id=%s AND qid=%s ORDER BY record_id', (exam_ID, QID))
      for record in [row['record_id'] for row in cursor.fetchall()]:
        decision_queries._lock_decision(conn, record, exam_ID)
        decision_queries._recalculate_score(conn, record, exam_ID)
      return changed


def remove_question(conn, QID, *, exam_ID):
    """Delete the current question; FK cascades are captured by audit triggers."""
    with conn.cursor() as cursor:
      cursor.execute('DELETE FROM rubric WHERE exam_id=%s AND qid=%s', (exam_ID,QID))
      return cursor.rowcount > 0
