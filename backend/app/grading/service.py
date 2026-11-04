"""Authenticated workflow over the existing current-state Database package.

Lock order: membership/exam, rubric, labels, mapping, decision. HTTP snapshots
are compared under these locks; no transaction spans a user's editing session.
"""
from contextlib import contextmanager
from decimal import Decimal
import hashlib
import json
from pathlib import Path

from fastapi import HTTPException

from app import config


def token(value):
    return '"' + hashlib.sha256(json.dumps(value, sort_keys=True, default=str,
                                         separators=(',', ':')).encode()).hexdigest() + '"'


def match(expected, actual):
    if expected is None:
        raise HTTPException(428, 'If-Match is required; refresh the workspace first')
    if expected != actual:
        raise HTTPException(412, 'Workspace changed; refresh and review before saving')


def amount(value):
    value = Decimal(str(value))
    if not value.is_finite() or abs(value) > Decimal('999.99') or value != value.quantize(Decimal('.01')):
        raise HTTPException(422, 'Scores must fit NUMERIC(5,2) without rounding')
    return value


class GradingService:
    def __init__(self, database, actor):
        self.db, self.actor = database, actor

    @contextmanager
    def access(self, exam, qid=None, *, edit=False):
        with self.db.audit_context(actor_ID=self.actor), self.db.transaction():
            with self.db.get_connection() as conn:
                conn.execute("SET LOCAL lock_timeout = '5s'")
                conn.execute("SET LOCAL statement_timeout = '15s'")
                member = conn.execute('''SELECT cs.role FROM course_staff cs
                    JOIN exam e USING(course_id)
                    WHERE e.exam_id=%s AND cs.directory_id=%s FOR SHARE OF cs,e''',
                                      (exam, self.actor)).fetchone()
                if member is None:
                    raise HTTPException(403, 'Not a member of this exam course')
                if qid is not None:
                    lock = 'FOR NO KEY UPDATE' if edit else 'FOR SHARE'
                    row = conn.execute('SELECT * FROM rubric WHERE exam_id=%s AND qid=%s ' + lock,
                                       (exam, qid)).fetchone()
                    if row is None:
                        raise HTTPException(404, 'Question not found')
                yield conn, member['role']

    def rubric(self, conn, exam, qid):
        rubric = conn.execute('SELECT * FROM rubric WHERE exam_id=%s AND qid=%s', (exam, qid)).fetchone()
        labels = conn.execute('''SELECT l.* FROM label l JOIN rubric_label rl USING(exam_id,label_id)
            WHERE rl.exam_id=%s AND rl.qid=%s ORDER BY l.label_id FOR SHARE OF l''', (exam, qid)).fetchall()
        return {'rubric': rubric, 'labels': labels}

    def _workspace(self, conn, exam, uid, qid, role, *, writing=False):
        # Recheck enrollment; a retained paper alone does not grant access.
        enrolled = conn.execute('''SELECT en.uid FROM enrollment en JOIN exam e USING(course_id)
            WHERE e.exam_id=%s AND en.uid=%s FOR SHARE OF en''', (exam, uid)).fetchone()
        if not enrolled:
            raise HTTPException(404, 'Student is not enrolled in this course')
        snapshot = self.rubric(conn, exam, qid)
        assignment = conn.execute('''SELECT * FROM mapping WHERE exam_id=%s AND uid=%s AND qid=%s'''
                                  + (' FOR NO KEY UPDATE' if writing else ' FOR SHARE'),
                                  (exam, uid, qid)).fetchone()
        if assignment is None:
            raise HTTPException(404, 'Grading assignment not found')
        if assignment['directory_id'] not in (None, self.actor) and role != 'instructor':
            raise HTTPException(403, 'Answer is assigned to another TA')
        decision = self.db.get_decision_by_student_question(uid, qid, exam_ID=exam)
        selected = self.db.get_decision_label(decision['record_id'], exam_ID=exam) if decision else []
        paper = conn.execute('SELECT scanned_pdf FROM studentpaper WHERE exam_id=%s AND uid=%s',
                             (exam, uid)).fetchone()
        data = dict(exam_ID=exam, UID=uid, QID=qid, assignment=assignment,
                    **snapshot, decision=decision, selected_labels=selected,
                    paper=paper)
        data['grade_token'] = token(data)
        data['rubric_token'] = token(snapshot)
        data.pop('paper')  # Never expose a server filesystem path.
        data['pdf_url'] = f'/api/exams/{exam}/students/{uid}/questions/{qid}/pdf'
        return data

    def workspace(self, exam, uid, qid):
        with self.access(exam, qid) as (conn, role):
            return self._workspace(conn, exam, uid, qid, role)

    def rubric_snapshot(self, exam, qid):
        with self.access(exam, qid) as (conn, _):
            result = self.rubric(conn, exam, qid)
            return {**result, 'rubric_token': token(result)}

    def save(self, exam, uid, qid, labels, comments, expected, *, regrade=False):
        if len(labels) != len(set(labels)):
            raise HTTPException(422, 'Duplicate labels')
        with self.access(exam, qid) as (conn, role):
            state = self._workspace(conn, exam, uid, qid, role, writing=True)
            match(expected, state['grade_token'])
            if bool(state['decision']) != regrade:
                raise HTTPException(409, 'Use regrade for an existing decision; grade for a new answer')
            definitions = {row['label_id']: row for row in state['labels']}
            if any(label not in definitions for label in labels):
                raise HTTPException(422, 'Selected labels must belong to this question rubric')
            score = amount(sum((definitions[label]['deduction'] for label in labels), Decimal(0)))
            if state['assignment']['directory_id'] is None:
                conn.execute('UPDATE mapping SET directory_id=%s WHERE exam_id=%s AND uid=%s AND qid=%s',
                             (self.actor, exam, uid, qid))
            record = state['decision']['record_id'] if regrade else self.db.save_decision(uid, qid, exam_ID=exam)
            self.db.add_decision_labels(record, labels, [self.actor] * len(labels), exam_ID=exam)
            self.db.update_decision(record, comments, exam_ID=exam)
            self.db.update_assignment_status(uid, qid, 'Finished', exam_ID=exam)
            return dict(record_ID=record, exam_ID=exam, UID=uid, QID=qid, score=score,
                        labels=labels, comments=comments, status='Finished')

    def change_rubric(self, exam, qid, title, description, deduction, expected):
        deduction = amount(deduction)
        with self.access(exam, qid, edit=True) as (conn, _):
            match(expected, token(self.rubric(conn, exam, qid)))
            label = self.db.add_label(title, description, deduction, exam_ID=exam)
            self.db.add_rubric_label(qid, label, exam_ID=exam)
            result = conn.execute("UPDATE mapping SET status='Regrade' WHERE exam_id=%s AND qid=%s", (exam, qid))
            return dict(exam_ID=exam, QID=qid, label_ID=label,
                        affected_mappings=result.rowcount, status='Regrade')

    def start(self, exam, qid):
        with self.access(exam, qid) as (conn, role):
            # Papers may arrive after rubric creation. Initialize only real,
            # enrolled answers, without inventing a student or a decision.
            conn.execute('''INSERT INTO mapping(exam_id,uid,qid,status)
                SELECT p.exam_id,p.uid,%s,'Pending' FROM studentpaper p
                JOIN exam e USING(exam_id) JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
                WHERE p.exam_id=%s ON CONFLICT DO NOTHING''', (qid, exam))
            row = conn.execute('''SELECT uid FROM mapping
                WHERE exam_id=%s AND qid=%s AND (directory_id=%s OR directory_id IS NULL)
                AND lower(COALESCE(status,'pending')) IN ('pending','regrade','inprogress','in_progress')
                ORDER BY (directory_id=%s) DESC NULLS LAST,uid FOR UPDATE SKIP LOCKED LIMIT 1''',
                               (exam, qid, self.actor, self.actor)).fetchone()
            if row is None:
                raise HTTPException(404, 'No available answers for this question')
            conn.execute('''UPDATE mapping SET directory_id=%s,
                status=CASE WHEN lower(status)='regrade' THEN 'Regrade' ELSE 'InProgress' END
                WHERE exam_id=%s AND uid=%s AND qid=%s''', (self.actor, exam, row['uid'], qid))
            return self._workspace(conn, exam, row['uid'], qid, role, writing=True)

    def release(self, exam, uid, qid):
        with self.access(exam, qid) as (conn, role):
            state = self._workspace(conn, exam, uid, qid, role, writing=True)
            if state['assignment']['directory_id'] != self.actor:
                raise HTTPException(403, 'Only the owner can release an answer')
            if str(state['assignment']['status']).lower() == 'finished':
                raise HTTPException(409, 'Finished answers cannot be released')
            conn.execute('''UPDATE mapping SET directory_id=NULL,
                status=CASE WHEN lower(status)='regrade' THEN 'Regrade' ELSE 'Pending' END
                WHERE exam_id=%s AND uid=%s AND qid=%s''', (exam, uid, qid))
            return {'released': True}

    def pdf(self, exam, uid, qid):
        with self.access(exam, qid) as (conn, role):
            self._workspace(conn, exam, uid, qid, role)
            row = conn.execute('SELECT scanned_pdf FROM studentpaper WHERE exam_id=%s AND uid=%s',
                               (exam, uid)).fetchone()
            if not row:
                raise HTTPException(404, 'Paper not found')
            root = config.DATA_DIR.resolve()
            path = Path(row['scanned_pdf'])
            path = (root / path).resolve() if not path.is_absolute() else path.resolve()
            if not path.is_relative_to(root) or path.suffix.lower() != '.pdf' or not path.is_file():
                raise HTTPException(404, 'PDF is unavailable')
            return path
