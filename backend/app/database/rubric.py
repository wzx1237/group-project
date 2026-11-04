"""Current rubric-label relationships; durable history is exported as JSONL."""
import logging
import psycopg
from typing import List, Dict, Any
logger = logging.getLogger(__name__)
__all__ = ["Rubric"]

class Rubric:
  """Business methods sharing Database transaction and audit handling."""

  def get_rubric(self, QID: str, *, exam_ID: int) -> Dict[str, Any] | None:
    '''
    input: question ID
    output: a dictionary of rubric, in format {QID: ..., grading_method: ..., total_scores: ...}
    '''
    try:
      # using 'with' to handle commit() and pool.connection return our connection to our pool
      with self.get_worker() as cursor:
        cursor.execute(
          """SELECT * FROM Rubric WHERE Rubric.exam_ID = %s AND QID = %s""", 
          (exam_ID, QID)
        )
        return self.get_one(cursor)    # primary key search, only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("question not found", extra={"extra": {"QID": QID}})
      raise

  def get_rubric_labels(self, QID: str, *, exam_ID: int) -> List[Dict[str, Any]]:
    """Return the current labels and question ID; history lives in audit JSONL."""
    with self.get_worker() as cursor:
      cursor.execute(
        """
        SELECT l.*, rl.QID FROM Rubric_Label AS rl JOIN Label AS l
        ON (l.exam_ID, l.Label_ID) = (rl.exam_ID, rl.Label_ID)
        WHERE rl.exam_ID = %s AND rl.QID = %s ORDER BY l.Label_ID
        """,
        (exam_ID, QID)
      )
      return self.get_all(cursor)

  def add_rubric_label(self, QID: str, label: int, *, exam_ID: int) -> int:
    """Append one current label; a duplicate returns its ID without another write."""
    with self.get_worker() as cursor:
      self._lock_rubric(cursor, QID, exam_ID)
      # The trigger records the inserted row only if the relationship is new.
      cursor.execute(
        """
        INSERT INTO Rubric_Label (exam_ID, QID, Label_ID) VALUES (%s, %s, %s)
        ON CONFLICT (exam_ID, QID, Label_ID) DO NOTHING
        """,
        (exam_ID, QID, label)
      )
      return label

  def add_rubric_labels(self, QID: str, labels: List[int], *, exam_ID: int) -> bool:
    """Replace the current label set, including clearing it with an empty list."""
    if len(labels) != len(set(labels)):
      raise ValueError('labels must not contain duplicates')
    with self.get_worker() as cursor:
      self._lock_rubric(cursor, QID, exam_ID)
      # Delete/insert and their before/after audit rows share this one transaction.
      cursor.execute('DELETE FROM Rubric_Label WHERE exam_ID = %s AND QID = %s', (exam_ID, QID))
      if labels:
        cursor.executemany(
          'INSERT INTO Rubric_Label (exam_ID, QID, Label_ID) VALUES (%s, %s, %s)',
          [(exam_ID, QID, label) for label in labels]
        )
      return True

  def remove_rubric_label(self, QID: str, Label_ID: int, *, exam_ID: int) -> bool:
    """Delete one current label and report whether a relationship was removed."""
    with self.get_worker() as cursor:
      self._lock_rubric(cursor, QID, exam_ID)
      # Removing the last label is safe because no older relationship rows remain.
      cursor.execute(
        'DELETE FROM Rubric_Label WHERE exam_ID = %s AND QID = %s AND Label_ID = %s',
        (exam_ID, QID, Label_ID)
      )
      return cursor.rowcount > 0

  def update_rubric(self, QID: str, Label_ID: int, old_label_ID: int | None = None, *, exam_ID: int) -> bool:
    """Replace one current relationship without changing the Label definition."""
    with self.get_worker() as cursor:
      self._lock_rubric(cursor, QID, exam_ID)
      cursor.execute('SELECT Label_ID FROM Rubric_Label WHERE exam_ID = %s AND QID = %s', (exam_ID, QID))
      current = [row['label_id'] for row in self.get_all(cursor)]
      if old_label_ID is None:
        if len(current) != 1:
          raise ValueError('Please specify old_label_ID when the rubric does not have exactly one label')
        old_label_ID = current[0]
      if old_label_ID not in current:
        raise ValueError('old_label_ID is not in the current rubric')
      if Label_ID == old_label_ID:
        return True
      if Label_ID in current:
        raise ValueError('The replacement label is already in the current rubric')
      # UPDATE supplies both OLD and NEW images to the audit trigger automatically.
      cursor.execute('UPDATE Rubric_Label SET Label_ID = %s WHERE exam_ID = %s AND QID = %s AND Label_ID = %s',
                     (Label_ID, exam_ID, QID, old_label_ID))
      return cursor.rowcount > 0

  def _lock_rubric(self, cursor, QID: str, exam_ID: int) -> None:
    """The parent row is a stable lock even when its current label set is empty."""
    cursor.execute(
      """
      SELECT QID FROM Rubric WHERE exam_ID = %s AND QID = %s
      FOR NO KEY UPDATE
      """, 
      (exam_ID, QID)
    )
    if self.get_one(cursor) is None:
      raise ValueError(f"Rubric {QID} does not exist")
