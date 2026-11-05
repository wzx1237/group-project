"""Decision records, current selected labels, and student score queries."""
import logging
import psycopg
from decimal import Decimal
from typing import List, Dict, Any
logger = logging.getLogger(__name__)
__all__ = ["Decision"]

class Decision:
  """Business methods sharing Database transaction and audit handling."""

  def get_grading_decision(self, UID: str, *, exam_ID: int) -> List[Dict[str, Any]] | None:
    '''
    input: student UID (dtype: string or int)
    output: a dictionary of grading decision, in format {record_ID: ..., UID: ..., QID: ..., scores: ..., comments_remark: ...)
    '''
    UID = self.normalize_uid(UID)
    try:
      # using 'with' to handle commit() and pool.connection return our connection to our pool
      with self.get_worker() as cursor:
        cursor.execute(
          """SELECT * FROM Decision WHERE Decision.exam_ID = %s AND UID = %s""", 
          (exam_ID, UID)
        )
        return self.get_all(cursor)    # search with value, could have multiple results
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("query student UID failed", extra={"extra": {"UID": UID}})
      raise

  def get_student_total_score(self, UID: str, *, exam_ID: int) -> float | None:
    '''
    input: student UID (dtype: string or int)
    output: the student scores for this exam
    '''
    UID = self.normalize_uid(UID)
    try:
      # using 'with' to handle commit() and pool.connection return our connection to our pool
      with self.get_worker() as cursor:
        cursor.execute(
          """SELECT COALESCE(SUM(scores), 0) AS Total FROM Decision WHERE Decision.exam_ID = %s AND UID = %s""", 
          (exam_ID, UID)
        )
        result = self.get_one(cursor)    # only one sun will be returned, use fetchone
        return float(result["total"])
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("query student UID failed", extra={"extra": {"UID": UID}})
      raise

  def get_decision(self, record_ID: int, *, exam_ID: int) -> Dict[str, Any] | None:
    '''
    input: the record ID for certain decision
    output: the info about our grading decision, format: {record_ID: ..., UID: ..., QID: ..., scores: ..., comments_remark: ...}
    '''
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """SELECT * FROM Decision WHERE Decision.exam_ID = %s AND record_ID = %s""", 
          (exam_ID, record_ID)
        )
        return self.get_one(cursor)    # primary key search, only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("we do not have such decision", extra={"extra": {"record_ID": record_ID}})
      raise

  def get_decision_by_student_question(self, UID: str, QID: str, *, exam_ID: int) -> Dict[str, Any] | None:
    '''
    input: the student UID and QID for certain grading result
    output: the info about our grading decision, format: {record_ID: ..., UID: ..., QID: ..., scores: ..., comments_remark: ...)
    '''
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """SELECT * FROM Decision WHERE Decision.exam_ID = %s AND UID = %s AND QID = %s""", 
          (exam_ID, UID, QID)
        )
        return self.get_one(cursor)    # promise to be UNIQUE(UID, QID), only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("we do not have such decision", extra={"extra": {"UID": UID, "QID": QID}})
      raise

  def save_decision(self, UID: str, QID: str, score: float | Decimal = 0, comments: str | None = None, *, exam_ID: int) -> int:
    '''
    input: add a new grading decision (not labels)
    output: the new record_ID
    '''
    try:
      with self.get_worker() as cursor:
        # TODO: consider whether add ON CONFLICT (UID, QID) DO NOTHING
        # With multiple exams, the assignment key is (exam_ID, UID, QID).
        # Lock the existing assignment to prevent concurrent duplicate decisions,
        # without changing the original schema or overwriting an existing grade.
        cursor.execute(
          """
          SELECT UID
          FROM Mapping
          WHERE Mapping.exam_ID = %s
            AND UID = %s
            AND QID = %s
          FOR NO KEY UPDATE
          """,
          (exam_ID, UID, QID)
        )
        # check whether student have answered this question
        if self.get_one(cursor) is None:
          raise ValueError("The student answer does not exist")
        # check whether we already have this decision; if have, you should use update_decision
        cursor.execute(
          """SELECT record_ID FROM Decision WHERE Decision.exam_ID = %s AND UID = %s AND QID = %s""", 
          (exam_ID, UID, QID)
        )
        if self.get_one(cursor) is not None:
          raise ValueError("A decision already exists for this student and question")
        # add new decision
        cursor.execute(
          """
          INSERT INTO Decision (exam_ID, UID, QID, scores, comments_remark)
          VALUES (%s, %s, %s, %s, %s)
          RETURNING record_ID
          """,
          (exam_ID, UID, QID, score, comments)
        )
        return self.get_one(cursor)["record_id"]    # promise to be UNIQUE(UID, QID), only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("create new decision", extra={"extra": {"UID": UID, "QID": QID}})
      raise

  def update_decision(self, record_ID: int, comments: str | None = None, *, exam_ID: int) -> bool:
    """Recalculate from all current selected labels and replace the comment."""
    with self.get_worker() as cursor:
      self._lock_decision(cursor, record_ID, exam_ID)
      self._recalculate_score(cursor, record_ID, exam_ID)
      # None explicitly clears the comment, retaining the uploaded v2 semantics.
      cursor.execute('UPDATE Decision SET comments_remark = %s WHERE exam_ID = %s AND record_ID = %s',
                     (comments, exam_ID, record_ID))
      return cursor.rowcount > 0

  def get_decision_label(self, record_ID: int, *, exam_ID: int) -> List[Dict[str, Any]]:
    """Return current label details, record ID, and the staff directory ID."""
    with self.get_worker() as cursor:
      cursor.execute(
        """
        SELECT l.*, dl.record_ID, dl.directory_ID FROM Decision_Label AS dl
        JOIN Label AS l ON (l.exam_ID, l.Label_ID) = (dl.exam_ID, dl.Label_ID)
        WHERE dl.exam_ID = %s AND dl.record_ID = %s ORDER BY l.Label_ID
        """,
        (exam_ID, record_ID)
      )
      return self.get_all(cursor)

  def add_decision_labels(self, record_ID: int, labels: List[int], Graders: List[str], *, exam_ID: int) -> bool:
    """Replace selected labels and recalculate the score in one audited transaction."""
    if len(labels) != len(Graders):
      raise ValueError('labels and Graders must have the same length')
    if len(labels) != len(set(labels)):
      raise ValueError('labels must not contain duplicates')
    with self.get_worker() as cursor:
      self._lock_decision(cursor, record_ID, exam_ID)
      self._validate_graders(cursor, Graders, exam_ID)
      # Any failed insert also rolls back the deletion, score update and outbox rows.
      cursor.execute('DELETE FROM Decision_Label WHERE exam_ID = %s AND record_ID = %s', (exam_ID, record_ID))
      if labels:
        cursor.executemany(
          """
          INSERT INTO Decision_Label (exam_ID, record_ID, Label_ID, directory_ID) VALUES (%s, %s, %s, %s)
          """,
          [(exam_ID, record_ID, label, grader) for label, grader in zip(labels, Graders)]
        )
      # An empty selection is a valid current state and contributes zero points.
      self._recalculate_score(cursor, record_ID, exam_ID)
      return True

  def add_decision_label(self, record_ID: int, label: int, Grader: str, *, exam_ID: int) -> bool:
    """Append one selected label and recalculate; duplicate selections return False."""
    with self.get_worker() as cursor:
      self._lock_decision(cursor, record_ID, exam_ID)
      self._validate_graders(cursor, [Grader], exam_ID)
      cursor.execute(
        """
        INSERT INTO Decision_Label (exam_ID, record_ID, Label_ID, directory_ID) VALUES (%s, %s, %s, %s)
        ON CONFLICT (exam_ID, record_ID, Label_ID) DO NOTHING
        """,
        (exam_ID, record_ID, label, Grader)
      )
      added = cursor.rowcount > 0
      if added:
        self._recalculate_score(cursor, record_ID, exam_ID)
      return added

  def remove_decision_label(self, record_ID: int, label_ID: int, *, exam_ID: int) -> bool:
    """Delete one selected label, including the last one, and recalculate the score."""
    with self.get_worker() as cursor:
      self._lock_decision(cursor, record_ID, exam_ID)
      cursor.execute(
        'DELETE FROM Decision_Label WHERE exam_ID = %s AND record_ID = %s AND Label_ID = %s',
        (exam_ID, record_ID, label_ID)
      )
      removed = cursor.rowcount > 0
      if removed:
        self._recalculate_score(cursor, record_ID, exam_ID)
      return removed

  def _lock_decision(self, cursor, record_ID: int, exam_ID: int):
    """Serialize changes even when this decision currently has no labels."""
    cursor.execute(
      """SELECT * FROM Decision WHERE exam_ID = %s AND record_ID = %s FOR NO KEY UPDATE""", 
      (exam_ID, record_ID)
    )
    decision = self.get_one(cursor)
    if decision is None:
      raise ValueError(f"Decision {record_ID} does not exist")
    return decision

  def _validate_graders(self, cursor, graders, exam_ID: int) -> None:
    """Keep each supplied course membership valid through the grading write."""
    for directory_ID in sorted(set(graders)):
      cursor.execute(
        """
        SELECT cs.directory_ID FROM course_staff AS cs
        JOIN Exam AS e ON e.course_ID = cs.course_ID
        WHERE e.exam_ID = %s AND cs.directory_ID = %s
        FOR SHARE OF cs, e
        """, 
        (exam_ID, directory_ID)
      )
      if self.get_one(cursor) is None:
        raise ValueError("Staff member is not assigned to the exam's course")

  def _recalculate_score(self, cursor, record_ID: int, exam_ID: int) -> None:
    """All rows are current rows now; signed deductions directly form the score."""
    cursor.execute(
      """
      SELECT COALESCE(SUM(l.deduction), 0) AS score
      FROM Decision_Label AS dl JOIN Label AS l
        ON (l.exam_ID, l.Label_ID) = (dl.exam_ID, dl.Label_ID)
      WHERE dl.exam_ID = %s AND dl.record_ID = %s
      """,
      (exam_ID, record_ID)
    )
    score = self.get_one(cursor)['score']
    cursor.execute(
      'UPDATE Decision SET scores = %s, updated_at = clock_timestamp() WHERE exam_ID = %s AND record_ID = %s',
      (score, exam_ID, record_ID)
    )
