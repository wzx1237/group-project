"""Creation and lookup of individual label definitions."""
from . import decision as decision_queries


import psycopg
import logging
from typing import Dict, Any
from decimal import Decimal

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["Label"]

class Label:
  """Methods provided to Database; this class does not create its own pool."""

  def get_label(self, label_ID: int, *, exam_ID: int) -> Dict[str, Any] | None:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return get_label(conn, label_ID, exam_ID=exam_ID)

  def add_label(self, title: str, description: str | None, deduction: float | Decimal, *, exam_ID: int) -> int:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return add_label(conn, title, description, deduction, exam_ID=exam_ID)

  def edit_label(self, label_ID, title, description, deduction, *, exam_ID):
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return edit_label(conn, label_ID, title, description, deduction, exam_ID=exam_ID)

  def remove_label(self, label_ID, *, exam_ID):
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return remove_label(conn, label_ID, exam_ID=exam_ID)

  def _change_label(self, label_ID, exam_ID, values):
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return _change_label(conn, label_ID, exam_ID, values)


def lock_question_labels(conn, exam_id, qid) -> list[dict]:
    """Read label definitions under shared locks so grading sees a stable rubric."""
    return conn.execute(
        """SELECT l.* FROM label l JOIN rubric_label rl USING(exam_id,label_id)
        WHERE rl.exam_id=%s AND rl.qid=%s ORDER BY l.label_id FOR SHARE OF l""",
        (exam_id, qid),
    ).fetchall()


def exam_selected_labels(conn, exam_id, uid) -> list[dict]:
    """Exam selected labels; return rows in query order."""
    return conn.execute(
        """SELECT l.*,dl.record_id,dl.directory_id FROM decision_label dl
        JOIN label l ON (l.exam_id,l.label_id)=(dl.exam_id,dl.label_id)
        JOIN decision d ON (d.exam_id,d.record_id)=(dl.exam_id,dl.record_id)
        WHERE dl.exam_id=%s AND (%s::text IS NULL OR d.uid=%s) ORDER BY l.label_id""",
        (exam_id, uid, uid),
    ).fetchall()


def get_label(conn, label_ID: int, *, exam_ID: int) -> Dict[str, Any] | None:
    '''
    input: label ID
    output: a dictionary contains label info {'Label_ID': ..., 'title': ..., 'descrption': ..., 'deduction': ...}
    '''
    try:
      with conn.cursor() as cursor:
        cursor.execute(
          """SELECT * FROM Label WHERE Label.exam_ID = %s AND Label_ID = %s""",
          (exam_ID, label_ID)
        )
        return cursor.fetchone()    # primary key search, only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("label not found", extra={"extra": {"label_ID": label_ID}})
      raise


def add_label(conn, title: str, description: str | None, deduction: float | Decimal, *, exam_ID: int) -> int:
    '''
    input: data required to create a new label
    output: the label ID for this newly created label
    '''
    try:
      with conn.cursor() as cursor:
        cursor.execute(
          """
          INSERT INTO Label (exam_ID, title, description, deduction)
          VALUES (%s, %s, %s, %s)
          RETURNING Label_ID
          """,
          (exam_ID, title, description, deduction)
        )
        new_id = cursor.fetchone()["label_id"]  # only one return, use fetchone
        return new_id
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("error occurs when create new label", extra={"extra": {"title": title}})
      raise


def edit_label(conn, label_ID, title, description, deduction, *, exam_ID):
    return _change_label(conn, label_ID, exam_ID, (title,description,deduction))


def remove_label(conn, label_ID, *, exam_ID):
    return _change_label(conn, label_ID, exam_ID, None)


def _change_label(conn, label_ID, exam_ID, values):
    """Change a definition and all cached scores atomically, including last-label removal.

    The exam row serializes definition edits with authenticated grading writes.
    Capture affected decisions before a DELETE cascades away their label links.
    """
    with conn.cursor() as cursor:
      cursor.execute('SELECT exam_id FROM assignment WHERE exam_id=%s FOR UPDATE', (exam_ID,))
      cursor.execute('SELECT record_id FROM decision_label WHERE exam_id=%s AND label_id=%s ORDER BY record_id', (exam_ID,label_ID))
      records = [row['record_id'] for row in cursor.fetchall()]
      if values is None:
        cursor.execute('DELETE FROM label WHERE exam_id=%s AND label_id=%s', (exam_ID,label_ID))
      else:
        cursor.execute('UPDATE label SET title=%s,description=%s,deduction=%s WHERE exam_id=%s AND label_id=%s', (*values,exam_ID,label_ID))
      changed = cursor.rowcount > 0
      for record in records:
        decision_queries._lock_decision(conn, record, exam_ID)
        decision_queries._recalculate_score(conn, record, exam_ID)
      return changed
