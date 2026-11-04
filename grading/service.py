"""Compose the database API without committing incomplete grading operations."""
from contextlib import contextmanager
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import json
from uuid import uuid4

from database import Database


class GradingError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _token(value) -> str:
    return '"' + sha256(json.dumps(value, sort_keys=True, default=str,
                                  separators=(',', ':')).encode()).hexdigest() + '"'


class GradingService:
    def __init__(self, db: Database, *, actor_ID: str, exam_ID: int | None = None,
                 expected_token: str | None = None, request_ID: str | None = None):
        self.db = db
        self.actor_ID = actor_ID
        self.exam_ID = exam_ID
        self.expected_token = expected_token
        self.request_ID = request_ID or str(uuid4())

    @contextmanager
    def _work(self):
        with self.db.audit_context(self.actor_ID, self.request_ID):
            with self.db.transaction():
                with self.db.get_worker() as cursor:
                    cursor.execute("SET LOCAL lock_timeout = '5s'")
                    cursor.execute("SET LOCAL statement_timeout = '15s'")
                    yield cursor

    def _authorize(self, cursor, exam_ID):
        # Hold membership until commit so revocation cannot race a successful save.
        cursor.execute("""
            SELECT cs.role FROM Exam e
            JOIN course_staff cs ON cs.course_ID = e.course_ID
            WHERE e.exam_ID = %s AND cs.directory_ID = %s
            FOR SHARE OF e, cs
        """, (exam_ID, self.actor_ID))
        row = self.db.get_one(cursor)
        if row is None:
            raise GradingError(403, 'Current course staff membership is required')
        return row['role']

    def _rubric(self, cursor, exam_ID, QID, *, write=False):
        # SHARE permits parallel grades on different answers. A rubric edit takes
        # NO KEY UPDATE, which conflicts with those readers through their commit.
        lock = 'FOR NO KEY UPDATE' if write else 'FOR SHARE'
        cursor.execute("""
            SELECT exam_ID, QID, grading_method, total_scores FROM Rubric
            WHERE exam_ID = %s AND QID = %s
        """ + lock, (exam_ID, QID))
        rubric = self.db.get_one(cursor)
        if rubric is None:
            raise GradingError(404, 'Question rubric does not exist')
        cursor.execute("""
            SELECT l.Label_ID, l.title, l.description, l.deduction
            FROM Rubric_Label rl JOIN Label l
              ON (l.exam_ID, l.Label_ID) = (rl.exam_ID, rl.Label_ID)
            WHERE rl.exam_ID = %s AND rl.QID = %s ORDER BY l.Label_ID
            FOR SHARE OF l, rl
        """, (exam_ID, QID))
        labels = self.db.get_all(cursor)
        rubric['labels'] = labels
        return rubric

    def _answer(self, cursor, exam_ID, UID, QID, role):
        cursor.execute("""
            SELECT en.UID FROM enrollment en JOIN Exam e ON e.course_ID = en.course_ID
            WHERE e.exam_ID = %s AND en.UID = %s FOR SHARE OF en
        """, (exam_ID, UID))
        if self.db.get_one(cursor) is None:
            raise GradingError(409, 'Student is no longer enrolled in this course')
        cursor.execute("""
            SELECT directory_ID, status FROM Mapping
            WHERE exam_ID = %s AND UID = %s AND QID = %s
            FOR NO KEY UPDATE
        """, (exam_ID, UID, QID))
        assignment = self.db.get_one(cursor)
        if assignment is None:
            raise GradingError(404, 'Student-question mapping does not exist')
        if role != 'instructor' and assignment['directory_id'] not in (None, self.actor_ID):
            raise GradingError(403, 'This answer is assigned to another grader')
        cursor.execute("""
            SELECT record_ID, scores, comments_remark FROM Decision
            WHERE exam_ID = %s AND UID = %s AND QID = %s FOR NO KEY UPDATE
        """, (exam_ID, UID, QID))
        decision = self.db.get_one(cursor)
        selected = []
        if decision:
            cursor.execute("""
                SELECT Label_ID, directory_ID FROM Decision_Label
                WHERE exam_ID = %s AND record_ID = %s ORDER BY Label_ID
                FOR SHARE
            """, (exam_ID, decision['record_id']))
            selected = self.db.get_all(cursor)
        return assignment, decision, selected

    def _check_token(self, actual):
        if self.expected_token is None:
            raise GradingError(428, 'Read the current workspace and send its token in If-Match')
        if self.expected_token != actual:
            raise GradingError(412, 'Workspace changed; refresh and review before saving')

    @staticmethod
    def _grade_token(rubric, assignment, decision, selected):
        return _token([rubric, assignment, decision, selected])

    def workspace(self, exam_ID: int, UID: int, QID: str):
        with self._work() as cursor:
            role = self._authorize(cursor, exam_ID)
            rubric = self._rubric(cursor, exam_ID, QID)
            assignment, decision, selected = self._answer(cursor, exam_ID, UID, QID, role)
            return {'exam_ID': exam_ID, 'UID': UID, 'QID': QID, 'rubric': rubric,
                    'assignment': assignment, 'decision': decision, 'selected': selected,
                    'rubric_token': _token(rubric),
                    'grade_token': self._grade_token(rubric, assignment, decision, selected)}

    def rubric_snapshot(self, exam_ID: int, QID: str):
        with self._work() as cursor:
            self._authorize(cursor, exam_ID)
            rubric = self._rubric(cursor, exam_ID, QID)
            return {'rubric': rubric, 'rubric_token': _token(rubric)}

    def grade(self, exam_ID: int, UID: int, QID: str, directory_ID: str,
              labels: list[int], comments: str | None):
        return self._save(exam_ID, UID, QID, directory_ID, labels, comments, regrade=False)

    def regrade(self, exam_ID: int, UID: int, QID: str, directory_ID: str,
                labels: list[int], comments: str | None):
        return self._save(exam_ID, UID, QID, directory_ID, labels, comments, regrade=True)

    def _save(self, exam_ID, UID, QID, directory_ID, labels, comments, *, regrade):
        if directory_ID != self.actor_ID:
            raise GradingError(403, 'directory_ID must match the authenticated staff member')
        if any(type(label) is not int or label <= 0 for label in labels):
            raise GradingError(422, 'labels must contain positive integer IDs')
        if len(labels) != len(set(labels)):
            raise GradingError(422, 'Duplicate label IDs are not allowed')
        with self._work() as cursor:
            role = self._authorize(cursor, exam_ID)
            rubric = self._rubric(cursor, exam_ID, QID)
            assignment, decision, selected = self._answer(cursor, exam_ID, UID, QID, role)
            self._check_token(self._grade_token(rubric, assignment, decision, selected))
            if regrade and decision is None:
                raise GradingError(409, 'No existing grade; use grade instead')
            if not regrade and decision is not None:
                raise GradingError(409, 'A grade already exists; use regrade instead')
            if not set(labels).issubset({row['label_id'] for row in rubric['labels']}):
                raise GradingError(422, 'Every selected label must belong to this current question rubric')
            # Check NUMERIC(5,2) capacity before touching any existing grade.
            score = sum((row['deduction'] or Decimal(0) for row in rubric['labels']
                         if row['label_id'] in labels), Decimal(0))
            if abs(score) > Decimal('999.99'):
                raise GradingError(422, 'The summed score exceeds the current database precision')
            if decision:
                record_ID = decision['record_id']
            else:
                record_ID = self.db.save_decision(UID, QID, comments=comments, exam_ID=exam_ID)
            self.db.add_decision_labels(record_ID, labels, [directory_ID] * len(labels), exam_ID=exam_ID)
            self.db.update_decision(record_ID, comments, exam_ID=exam_ID)
            # Claim an unassigned answer only once its complete grade is saved.
            if assignment['directory_id'] is None:
                cursor.execute("""UPDATE Mapping SET directory_ID = %s
                                  WHERE exam_ID = %s AND UID = %s AND QID = %s""",
                               (directory_ID, exam_ID, UID, QID))
            self.db.update_assignment_status(UID, QID, 'Finished', exam_ID=exam_ID)
            return {'exam_ID': exam_ID, 'UID': UID, 'QID': QID, 'record_ID': record_ID,
                    'score': score, 'labels': labels, 'comments': comments, 'status': 'Finished'}

    def change_rubric(self, title: str, description: str | None,
                      deduction: Decimal, QID: str):
        if self.exam_ID is None:
            raise GradingError(422, 'exam_ID must be provided by the route/service context')
        if not isinstance(title, str) or not title.strip() or len(title) > 50:
            raise GradingError(422, 'title must contain 1 to 50 characters')
        try:
            deduction = Decimal(str(deduction))
            valid = (deduction.is_finite() and abs(deduction) <= Decimal('999.99')
                     and deduction == deduction.quantize(Decimal('0.01')))
        except (ValueError, TypeError, InvalidOperation):
            valid = False
        if not valid:
            raise GradingError(422, 'deduction must be a finite NUMERIC(5,2) value')
        exam_ID = self.exam_ID
        with self._work() as cursor:
            self._authorize(cursor, exam_ID)
            rubric = self._rubric(cursor, exam_ID, QID, write=True)
            self._check_token(_token(rubric))
            label_ID = self.db.add_label(title, description, deduction, exam_ID=exam_ID)
            self.db.add_rubric_label(QID, label_ID, exam_ID=exam_ID)
            # Include ungraded mappings as requested; no Decision is created here.
            cursor.execute("""UPDATE Mapping SET status = 'Regrade'
                              WHERE exam_ID = %s AND QID = %s""", (exam_ID, QID))
            return {'exam_ID': exam_ID, 'QID': QID, 'label_ID': label_ID,
                    'affected_mappings': cursor.rowcount, 'status': 'Regrade'}
