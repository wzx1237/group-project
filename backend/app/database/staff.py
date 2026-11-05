"""Staff profiles, global roles, and grading task assignments."""


import psycopg
import logging
from typing import List, Dict, Any

# create a logger to store our log:
logger = logging.getLogger(__name__)

__all__ = ["Staff"]

class Staff:
  """Methods provided to Database; this class does not create its own pool."""

  def get_staff(self, directory_ID: str) -> Dict[str, Any] | None:
    """Return a staff profile with its related courses and the global staff role."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          SELECT directory_id, name, email
          FROM staff
          WHERE directory_id = %s
          """,
          (directory_ID, )
        )
        staff = self.get_one(cursor)
        if staff is None:
          return None
        # Use the same cursor and transaction for the profile and course list.
        cursor.execute(
          """
          SELECT c.course_id, c.code, c.term, c.title, s.role
          FROM course_staff AS cs
          JOIN course AS c ON c.course_id = cs.course_id
          JOIN staff AS s ON s.directory_id = cs.directory_id
          WHERE cs.directory_id = %s
          ORDER BY c.course_id
          """,
          (directory_ID, )
        )
        staff["courses"] = self.get_all(cursor)
        return staff
    except psycopg.Error as error:
      logger.exception("query staff failed", extra={"extra": {"directory_ID": directory_ID}})
      raise

  def get_grader(self, directory_ID: str) -> Dict[str, Any] | None:
    """Compatibility name for get_staff; Grader_ID is now a staff directory ID."""
    return self.get_staff(directory_ID)

  def get_grader_assignments(self, directory_ID: str, *, exam_ID: int) -> List[Dict[str, Any]]:
    '''
    input: dirctory_id
    output: UID and QID tell TA should grade which question from which student, format {UID: ..., QID: ..., status: ...}
    '''
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          SELECT *
          FROM Mapping
          WHERE Mapping.exam_ID = %s
            AND directory_id = %s
          """, 
          (exam_ID, directory_ID)
        )
        return self.get_all(cursor)    # primary key search, only return one row, if not find, return None
        # Correction: Grader_ID is not unique in Mapping; return all assignments.
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("query directory_ID failed", extra={"extra": {"directory_ID": directory_ID}})
      raise

  def assign_grader(self, UID: str, QID: str, directory_ID: str, status: str = "Pending", *, exam_ID: int) -> bool:
    '''
    input: UID, QID, Grader_ID to indicate which question should be assigned to which TA
    output: whether our assignment done well
    '''
    try:
      with self.get_worker() as cursor:
        # Check enrollment and course membership in the same transaction as assignment.
        cursor.execute(
          """
          SELECT en.uid
          FROM enrollment AS en
          JOIN Exam AS e ON e.course_id = en.course_id
          WHERE e.exam_ID = %s
            AND en.uid = %s
          FOR SHARE OF en, e
          """,
          (exam_ID, UID)
        )
        if self.get_one(cursor) is None:
          raise ValueError("Student is not enrolled in the exam's course")
        cursor.execute(
          """
          SELECT cs.directory_id
          FROM course_staff AS cs
          JOIN Exam AS e ON e.course_id = cs.course_id
          WHERE e.exam_ID = %s
            AND cs.directory_id = %s
          FOR SHARE OF cs, e
          """,
          (exam_ID, directory_ID)
        )
        if self.get_one(cursor) is None:
          raise ValueError("Staff member is not assigned to the exam's course")
        # TODO: consider whether add ON CONFLICT (UID, QID) DO NOTHING
        # With multiple exams, the assignment key is (exam_ID, UID, QID).
        cursor.execute(
          """
          INSERT INTO Mapping (exam_ID, uid, QID, directory_id, status)
          VALUES (%s, %s, %s, %s, %s)
          """, (exam_ID, UID, QID, directory_ID, status)
        )
        return cursor.rowcount > 0
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("insertion failed, possibly primary key conflict", extra={"extra": {"UID": UID, "QID": QID}})
      raise

  def update_assignment_status(self, UID: str, QID: str, status: str, *, exam_ID: int) -> bool:
    '''
    input: the UID, QID and new status to our assignment
    output: whether our update is success
    '''
    try:
      with self.get_worker() as cursor:
        # TODO: whether add a lock here: UPDATE Mapping SET status=status WHERE UID=UID AND QID=QID AND status=expect_status
        cursor.execute(
          """
          UPDATE Mapping
          SET status = %s
          WHERE Mapping.exam_ID = %s
            AND uid = %s
            AND QID = %s
          """, 
          (status, exam_ID, UID, QID)
        )
        return (cursor.rowcount > 0)
    except psycopg.Error as error:
      # if exception happens, save it to our log
      logger.exception("update assignment status failed", extra={"extra": {"UID": UID, "QID": QID}})
      raise

  def add_staff(self, directory_ID: str, name: str, email: str | None = None, *, role: str) -> bool:
    """Create a global staff member; return False for an existing directory ID."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          INSERT INTO staff (directory_id, name, email, role)
          VALUES (%s, %s, %s, %s)
          ON CONFLICT (directory_id) DO NOTHING
          """,
          (directory_ID.lower(), name, email, role.lower())
        )
        return cursor.rowcount > 0
    except psycopg.Error as error:
      logger.exception("create staff failed", extra={"extra": {"directory_ID": directory_ID}})
      raise

  def add_staff_to_course(self, course_ID: int, directory_ID: str) -> bool:
    """Add a course membership; return False without changing an existing membership."""
    try:
      with self.get_worker() as cursor:
        cursor.execute(
          """
          INSERT INTO course_staff (course_id, directory_id)
          VALUES (%s, %s)
          ON CONFLICT (course_id, directory_id) DO NOTHING
          """,
          (course_ID, directory_ID.lower())
        )
        return cursor.rowcount > 0
    except psycopg.Error as error:
      logger.exception("add course staff failed", extra={"extra": {"directory_ID": directory_ID, "course_ID": course_ID}})
      raise
