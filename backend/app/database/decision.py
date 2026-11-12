"""Decision records, current selected labels, and student score queries."""
import logging
import psycopg
from decimal import Decimal
from typing import List, Dict, Any
logger = logging.getLogger(__name__)
__all__ = ["Decision"]

class Decision:
  """Business methods sharing Database transaction and audit handling."""

  # Retired: reports.exam_decisions is the reporting query.
  # def get_grading_decision(self, UID: str, *, exam_ID: int) -> List[Dict[str, Any]] | None:
  #   '''
  #   input: student UID (dtype: string)
  #   output: a dictionary of grading decision, in format {record_ID: ..., uid: ..., QID: ..., scores: ..., comments_remark: ...)
  #   '''
  #   try:
  #     # using 'with' to handle commit() and pool.connection return our connection to our pool
  #     with self.get_worker() as cursor:
  #       cursor.execute(
  #         """SELECT * FROM Decision WHERE Decision.exam_ID = %s AND uid = %s""",
  #         (exam_ID, UID)
  #       )
  #       return self.get_all(cursor)    # search with value, could have multiple results
  #   except psycopg.Error as error:
  #     # if exception happens, save it to our log
  #     logger.exception("query student UID failed", extra={"extra": {"UID": UID}})
  #     raise

  # Retired: reports calculates assignment totals with incomplete and no-show semantics.
  # def get_student_total_score(self, UID: str, *, exam_ID: int) -> float | None:
  #   '''
  #   input: student UID (dtype: string or int)
  #   output: the student scores for this exam
  #   '''
  #   try:
  #     # using 'with' to handle commit() and pool.connection return our connection to our pool
  #     with self.get_worker() as cursor:
  #       cursor.execute(
  #         """SELECT COALESCE(SUM(scores), 0) AS Total FROM Decision WHERE Decision.exam_ID = %s AND uid = %s""",
  #         (exam_ID, UID)
  #       )
  #       result = self.get_one(cursor)    # only one sun will be returned, use fetchone
  #       return float(result["total"])
  #   except psycopg.Error as error:
  #     # if exception happens, save it to our log
  #     logger.exception("query student UID failed", extra={"extra": {"UID": UID}})
  #     raise

  def get_decision(self, record_ID: int, *, exam_ID: int) -> Dict[str, Any] | None:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return get_decision(conn, record_ID, exam_ID=exam_ID)

  def get_decision_by_student_question(self, UID: str, QID: str, *, exam_ID: int) -> Dict[str, Any] | None:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return get_decision_by_student_question(conn, UID, QID, exam_ID=exam_ID)

  def save_decision(self, UID: str, QID: str, score: float | Decimal=0, comments: str | None=None, *, exam_ID: int) -> int:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return save_decision(conn, UID, QID, score, comments, exam_ID=exam_ID)

  def update_decision(self, record_ID: int, comments: str | None=None, *, exam_ID: int) -> bool:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return update_decision(conn, record_ID, comments, exam_ID=exam_ID)

  def get_decision_label(self, record_ID: int, *, exam_ID: int) -> List[Dict[str, Any]]:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return get_decision_label(conn, record_ID, exam_ID=exam_ID)

  def add_decision_labels(self, record_ID: int, labels: List[int], Graders: List[str], *, exam_ID: int) -> bool:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return add_decision_labels(conn, record_ID, labels, Graders, exam_ID=exam_ID)

  def add_decision_label(self, record_ID: int, label: int, Grader: str, *, exam_ID: int) -> bool:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return add_decision_label(conn, record_ID, label, Grader, exam_ID=exam_ID)

  def remove_decision_label(self, record_ID: int, label_ID: int, *, exam_ID: int) -> bool:
    """Compatibility adapter; transaction and audit stay with Database."""
    with self.get_connection() as conn:
      return remove_decision_label(conn, record_ID, label_ID, exam_ID=exam_ID)

  def _lock_decision(self, cursor, record_ID: int, exam_ID: int):
    """Compatibility adapter; transaction and audit stay with Database."""
    return _lock_decision(cursor.connection, record_ID, exam_ID)

  def _validate_graders(self, cursor, graders, exam_ID: int) -> None:
    """Compatibility adapter; transaction and audit stay with Database."""
    return _validate_graders(cursor.connection, graders, exam_ID)

  def _recalculate_score(self, cursor, record_ID: int, exam_ID: int) -> None:
    """Compatibility adapter; transaction and audit stay with Database."""
    return _recalculate_score(cursor.connection, record_ID, exam_ID)

"""
The above part is old database method, the below part this the functions
Now, function method is available.
"""


def enrolled_decisions(conn, exam_id, uid) -> list[dict]:
    # Enrolled decisions; return rows in query order.
    return conn.execute(
        """SELECT d.* FROM decision d JOIN assignment e USING(exam_id)
        JOIN enrollment en ON en.uid=d.uid AND en.course_id=e.course_id
        WHERE d.exam_id=%s AND (%s::text IS NULL OR d.uid=%s) ORDER BY d.uid,d.qid""",
        (exam_id, uid, uid),
    ).fetchall()


def set_internal_note(conn, internal_note, exam_id, uid, qid) -> int:
    # Set internal note; return the affected row count.
    return conn.execute(
        """UPDATE decision SET internal_note=%s,updated_at=clock_timestamp() WHERE exam_id=%s AND uid=%s AND qid=%s""",
        (internal_note, exam_id, uid, qid),
    ).rowcount


def has_saved_decisions(conn, exam_id, uids) -> bool:
    # Has saved (1 or some) decisions for some student (for certain exam); return None when missing.
    row = conn.execute('SELECT 1 FROM decision WHERE exam_id = %s AND uid = ANY(%s) LIMIT 1', (exam_id, uids)).fetchone()
    if row is None:
      return False
    else:
      return True


def get_decision(conn, record_ID: int, *, exam_ID: int) -> Dict[str, Any] | None:
    '''
    input: the record ID for certain decision
    output: the info about our grading decision, format: {record_ID: ..., uid: ..., QID: ..., scores: ..., comments_remark: ...}
    '''
    try:
      with conn.cursor() as cursor:
        cursor.execute(
          """SELECT * FROM Decision WHERE Decision.exam_ID = %s AND record_ID = %s""",
          (exam_ID, record_ID)
        )
        return cursor.fetchone()    # primary key search, only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("we do not have such decision", extra={"extra": {"record_ID": record_ID}})
      raise


def get_decision_by_student_question(conn, UID: str, QID: str, *, exam_ID: int) -> Dict[str, Any] | None:
    '''
    input: the student UID and QID for certain grading result
    output: the info about our grading decision, format: {record_ID: ..., uid: ..., QID: ..., scores: ..., comments_remark: ...)
    '''
    try:
      with conn.cursor() as cursor:
        cursor.execute(
          """SELECT * FROM Decision WHERE Decision.exam_ID = %s AND uid = %s AND QID = %s""",
          (exam_ID, UID, QID)
        )
        return cursor.fetchone()    # promise to be UNIQUE(UID, QID), only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("we do not have such decision", extra={"extra": {"UID": UID, "QID": QID}})
      raise


def save_decision(conn, UID: str, QID: str, score: float | Decimal=0, comments: str | None=None, *, exam_ID: int) -> int:
    '''
    input: add a new grading decision (not labels)
    output: the new record_ID
    '''
    try:
      with conn.cursor() as cursor:
        # TODO: consider whether add ON CONFLICT (UID, QID) DO NOTHING
        # With multiple exams, the assignment key is (exam_ID, UID, QID).
        # Lock the existing assignment to prevent concurrent duplicate decisions,
        # without changing the original schema or overwriting an existing grade.
        cursor.execute(
          """
          SELECT uid
          FROM Mapping
          WHERE Mapping.exam_ID = %s
            AND uid = %s
            AND QID = %s
          FOR NO KEY UPDATE
          """,
          (exam_ID, UID, QID)
        )
        # check whether student have answered this question
        if cursor.fetchone() is None:
          raise ValueError("The student answer does not exist")
        # check whether we already have this decision; if have, you should use update_decision
        cursor.execute(
          """SELECT record_ID FROM Decision WHERE Decision.exam_ID = %s AND uid = %s AND QID = %s""",
          (exam_ID, UID, QID)
        )
        if cursor.fetchone() is not None:
          raise ValueError("A decision already exists for this student and question")
        # add new decision
        cursor.execute(
          """
          INSERT INTO Decision (exam_ID, uid, QID, scores, comments_remark)
          VALUES (%s, %s, %s, %s, %s)
          RETURNING record_ID
          """,
          (exam_ID, UID, QID, score, comments)
        )
        return cursor.fetchone()["record_id"]    # promise to be UNIQUE(UID, QID), only one return
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("create new decision", extra={"extra": {"UID": UID, "QID": QID}})
      raise


def update_decision(conn, record_ID: int, comments: str | None=None, *, exam_ID: int) -> bool:
    """Recalculate from all current selected labels and replace the comment."""
    with conn.cursor() as cursor:
      _lock_decision(conn, record_ID, exam_ID)
      _recalculate_score(conn, record_ID, exam_ID)
      # None explicitly clears the comment, retaining the uploaded v2 semantics.
      cursor.execute('UPDATE Decision SET comments_remark = %s WHERE exam_ID = %s AND record_ID = %s',
                     (comments, exam_ID, record_ID))
      return cursor.rowcount > 0


def get_decision_label(conn, record_ID: int, *, exam_ID: int) -> List[Dict[str, Any]]:
    """Return current label details, record ID, and the staff directory ID."""
    with conn.cursor() as cursor:
      cursor.execute(
        """
        SELECT l.*, dl.record_ID, dl.directory_id FROM Decision_Label AS dl
        JOIN Label AS l ON (l.exam_ID, l.Label_ID) = (dl.exam_ID, dl.Label_ID)
        WHERE dl.exam_ID = %s AND dl.record_ID = %s ORDER BY l.Label_ID
        """,
        (exam_ID, record_ID)
      )
      return cursor.fetchall()


def add_decision_labels(conn, record_ID: int, labels: List[int], Graders: List[str], *, exam_ID: int) -> bool:
    """Replace selected labels and recalculate the score in one audited transaction."""
    if len(labels) != len(Graders):
      raise ValueError('labels and Graders must have the same length')
    if len(labels) != len(set(labels)):
      raise ValueError('labels must not contain duplicates')
    with conn.cursor() as cursor:
      _lock_decision(conn, record_ID, exam_ID)
      _validate_graders(conn, Graders, exam_ID)
      # Any failed insert also rolls back the deletion, score update and outbox rows.
      cursor.execute('DELETE FROM Decision_Label WHERE exam_ID = %s AND record_ID = %s', (exam_ID, record_ID))
      if labels:
        cursor.executemany(
          """
          INSERT INTO Decision_Label (exam_ID, record_ID, Label_ID, directory_id) VALUES (%s, %s, %s, %s)
          """,
          [(exam_ID, record_ID, label, grader) for label, grader in zip(labels, Graders)]
        )
      # An empty selection leaves the answer ungraded, with no score.
      _recalculate_score(conn, record_ID, exam_ID)
      return True


def add_decision_label(conn, record_ID: int, label: int, Grader: str, *, exam_ID: int) -> bool:
    """Append one selected label and recalculate; duplicate selections return False."""
    with conn.cursor() as cursor:
      _lock_decision(conn, record_ID, exam_ID)
      _validate_graders(conn, [Grader], exam_ID)
      cursor.execute(
        """
        INSERT INTO Decision_Label (exam_ID, record_ID, Label_ID, directory_id) VALUES (%s, %s, %s, %s)
        ON CONFLICT (exam_ID, record_ID, Label_ID) DO NOTHING
        """,
        (exam_ID, record_ID, label, Grader)
      )
      added = cursor.rowcount > 0
      if added:
        _recalculate_score(conn, record_ID, exam_ID)
      return added


def remove_decision_label(conn, record_ID: int, label_ID: int, *, exam_ID: int) -> bool:
    """Delete one selected label, including the last one, and recalculate the score."""
    with conn.cursor() as cursor:
      _lock_decision(conn, record_ID, exam_ID)
      cursor.execute(
        'DELETE FROM Decision_Label WHERE exam_ID = %s AND record_ID = %s AND Label_ID = %s',
        (exam_ID, record_ID, label_ID)
      )
      removed = cursor.rowcount > 0
      if removed:
        _recalculate_score(conn, record_ID, exam_ID)
      return removed


def _lock_decision(conn, record_ID: int, exam_ID: int):
    """Serialize changes even when this decision currently has no labels."""
    with conn.cursor() as cursor:
      cursor.execute(
        """SELECT * FROM Decision WHERE exam_ID = %s AND record_ID = %s FOR NO KEY UPDATE""",
        (exam_ID, record_ID)
      )
      decision = cursor.fetchone()
      if decision is None:
        raise ValueError(f"Decision {record_ID} does not exist")
      return decision


def _validate_graders(conn, graders, exam_ID: int) -> None:
    """Keep each supplied course membership valid through the grading write."""
    with conn.cursor() as cursor:
      for directory_ID in sorted(set(graders)):
        cursor.execute(
          """
          SELECT cs.directory_id FROM course_staff AS cs
          JOIN assignment AS e ON e.course_id = cs.course_id
          WHERE e.exam_ID = %s AND cs.directory_id = %s
          FOR SHARE OF cs, e
          """,
          (exam_ID, directory_ID)
        )
        if cursor.fetchone() is None:
          raise ValueError("Staff member is not assigned to the exam's course")


def _recalculate_score(conn, record_ID: int, exam_ID: int) -> None:
    """Start at full points ('deduct') or 0 ('add'), add the signed labels, keep it between 0 and total_scores.
    With no labels the answer isn't graded yet, so the score is NULL.
    """
    with conn.cursor() as cursor:
      cursor.execute(
        """
        SELECT CASE WHEN COUNT(l.Label_ID) > 0 THEN LEAST(GREATEST(
                 CASE WHEN r.scoring = 'deduct' THEN COALESCE(r.total_scores, 0) ELSE 0 END
                 + SUM(l.deduction), 0), COALESCE(r.total_scores, 0)) END AS score
        FROM Decision AS d
          JOIN Rubric AS r ON (r.exam_ID, r.QID) = (d.exam_ID, d.QID)
          LEFT JOIN Decision_Label AS dl ON (dl.exam_ID, dl.record_ID) = (d.exam_ID, d.record_ID)
          LEFT JOIN Label AS l ON (l.exam_ID, l.Label_ID) = (dl.exam_ID, dl.Label_ID)
        WHERE d.exam_ID = %s AND d.record_ID = %s
        GROUP BY r.scoring, r.total_scores
        """,
        (exam_ID, record_ID)
      )
      score = cursor.fetchone()['score']
      cursor.execute(
        'UPDATE Decision SET scores = %s, updated_at = clock_timestamp() WHERE exam_ID = %s AND record_ID = %s',
        (score, exam_ID, record_ID)
      )
