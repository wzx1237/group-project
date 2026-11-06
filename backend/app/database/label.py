"""Creation and lookup of individual label definitions."""


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
    '''
    input: label ID
    output: a dictionary contains label info {'Label_ID': ..., 'title': ..., 'descrption': ..., 'deduction': ...}
    '''
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """SELECT * FROM Label WHERE Label.exam_ID = %s AND Label_ID = %s""",
          (exam_ID, label_ID)
        )
        return self.get_one(cursor)    # primary key search, only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("label not found", extra={"extra": {"label_ID": label_ID}})
      raise

  def add_label(self, title: str, description: str | None, deduction: float | Decimal, *, exam_ID: int) -> int:
    '''
    input: data required to create a new label
    output: the label ID for this newly created label
    '''
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          INSERT INTO Label (exam_ID, title, description, deduction)
          VALUES (%s, %s, %s, %s)
          RETURNING Label_ID
          """,
          (exam_ID, title, description, deduction)
        )
        new_id = self.get_one(cursor)["label_id"]  # only one return, use fetchone
        return new_id
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("error occurs when create new label", extra={"extra": {"title": title}})
      raise

  def edit_label(self, label_ID, title, description, deduction, *, exam_ID):
    return self._change_label(label_ID, exam_ID, (title,description,deduction))

  def remove_label(self, label_ID, *, exam_ID):
    return self._change_label(label_ID, exam_ID, None)

  def _change_label(self, label_ID, exam_ID, values):
    """Change a definition and all cached scores atomically, including last-label removal.

    The exam row serializes definition edits with authenticated grading writes.
    Capture affected decisions before a DELETE cascades away their label links.
    """
    with self.get_worker() as cursor:
      cursor.execute('SELECT exam_id FROM assignment WHERE exam_id=%s FOR UPDATE', (exam_ID,))
      cursor.execute('SELECT record_id FROM decision_label WHERE exam_id=%s AND label_id=%s ORDER BY record_id', (exam_ID,label_ID))
      records = [row['record_id'] for row in cursor.fetchall()]
      if values is None:
        cursor.execute('DELETE FROM label WHERE exam_id=%s AND label_id=%s', (exam_ID,label_ID))
      else:
        cursor.execute('UPDATE label SET title=%s,description=%s,deduction=%s WHERE exam_id=%s AND label_id=%s', (*values,exam_ID,label_ID))
      changed = cursor.rowcount > 0
      for record in records:
        self._lock_decision(cursor, record, exam_ID)
        self._recalculate_score(cursor, record, exam_ID)
      return changed
