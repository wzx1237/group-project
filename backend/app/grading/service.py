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

from app import config, workflow
from app.database import exam as exam_db
from app.database import grading as grading_db
from app.database import label as label_db
from app.database import locks as locks_db
from app.database import regrade as regrade_db
from app.database import rubric as rubric_db
from app.database import staff as staff_db
from app.database import student as student_db
from app.database import studentpaper as studentpaper_db
from app.database import decision as decision_db

# Grades can be saved or claimed only in these assignment statuses.
GRADING = ('grading', 'in_review')


def token(value):
    return '"' + hashlib.sha256(json.dumps(value, sort_keys=True, default=str,
                                         separators=(',', ':')).encode()).hexdigest() + '"'


def match(expected, actual):
    if expected is None:
        raise HTTPException(428, 'If-Match is required; refresh the workspace first')
    if expected != actual:
        raise HTTPException(412, 'Workspace changed; refresh and review before saving')


def locked_by(lock, doing='grading this answer'):
    """409 for an answer (or overall comment) another grader is working on; the page shows who holds it."""
    name = (lock or {}).get('holder_name') or 'Another grader'
    return HTTPException(409, {'message': f'{name} is {doing} right now', 'locked_by': (lock or {}).get('holder')})


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
                grading_db.set_lock_timeout(conn)
                grading_db.set_statement_timeout(conn)
                # One short database transaction per request; never hold a lock while a user edits.
                exam_db.lock_exam(conn, exam)
                member = staff_db.lock_exam_membership(conn, exam, self.actor)
                if member is None:
                    raise HTTPException(403, 'Not a member of this exam course')
                if qid is not None:
                    row = rubric_db.lock_question(conn, exam, qid, edit=edit)
                    if row is None:
                        raise HTTPException(404, 'Question not found')
                yield conn, member['role']

    def rubric(self, conn, exam, qid):
        rubric = rubric_db.question_row(conn, exam, qid)
        labels = label_db.lock_question_labels(conn, exam, qid)
        return {'rubric': rubric, 'labels': labels}

    def _workspace(self, conn, exam, uid, qid, role, *, writing=False):
        # Recheck enrollment; a retained paper alone does not grant access.
        enrolled = student_db.lock_exam_enrollment(conn, exam, uid)
        if not enrolled:
            raise HTTPException(404, 'Student is not enrolled in this course')
        snapshot = self.rubric(conn, exam, qid)
        assignment = grading_db.lock_mapping(conn, writing, exam, uid, qid)
        if assignment is None:
            raise HTTPException(404, 'Grading assignment not found')
        decision = decision_db.get_decision_by_student_question(conn, uid, qid, exam_ID=exam)
        selected = decision_db.get_decision_label(conn, decision['record_id'], exam_ID=exam) if decision else []
        paper = studentpaper_db.paper_path(conn, exam, uid)
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
            workflow.require(conn, exam, GRADING, 'Grading')
            state = self._workspace(conn, exam, uid, qid, role, writing=True)
            match(expected, state['grade_token'])
            if bool(state['decision']) != regrade:
                raise HTTPException(409, 'Use regrade for an existing decision; grade for a new answer')
            definitions = {row['label_id']: row for row in state['labels']}
            if any(label not in definitions for label in labels):
                raise HTTPException(422, 'Selected labels must belong to this question rubric')
            # A split criterion stays on answers that had it until they are regraded, but is never applied again.
            kept = {row['label_id'] for row in state['selected_labels']}
            if any(definitions[label].get('retired_at') and label not in kept for label in labels):
                raise HTTPException(422, 'That criterion was split; apply one of its replacements instead')
            # Saving takes (or renews) the answer's lock, so nobody else edits it while this grader works on it.
            if locks_db.take(conn, self.actor, exam, uid, qid) is None:
                raise locked_by(locks_db.holder(conn, exam, uid, qid))
            if state['assignment']['directory_id'] is None:
                grading_db.assign_grader(conn, self.actor, exam, uid, qid)
            record = state['decision']['record_id'] if regrade else self.db.save_decision(uid, qid, exam_ID=exam)
            self.db.add_decision_labels(record, labels, [self.actor] * len(labels), exam_ID=exam)
            self.db.update_decision(record, comments, exam_ID=exam)
            # An answer is graded once a label is applied; with none it stays in progress. One still waiting in a
            # regrade queue stays 'Regrade' until it is reviewed there.
            status = 'Finished' if labels else 'InProgress'
            if regrade_db.waiting(conn, exam, uid, qid):
                status = 'Regrade'
            self.db.update_assignment_status(uid, qid, status, exam_ID=exam)
            # The database applies the question's scoring and limits, so report what it saved.
            score = decision_db.get_decision(conn, record, exam_ID=exam)['scores']
            return dict(record_ID=record, exam_ID=exam, UID=uid, QID=qid, score=score,
                        labels=labels, comments=comments, status=status)

    def change_rubric(self, exam, qid, title, description, deduction, expected):
        deduction = amount(deduction)
        with self.access(exam, qid, edit=True) as (conn, _):
            workflow.require(conn, exam, workflow.OPEN, 'Changing the rubric')
            match(expected, token(self.rubric(conn, exam, qid)))
            label = label_db.add_label(conn, title, description, deduction, exam_ID=exam)
            rubric_db.add_rubric_label(conn, qid, label, exam_ID=exam)
            result = grading_db.mark_question_for_regrade(conn, exam, qid)
            return dict(exam_ID=exam, QID=qid, label_ID=label,
                        affected_mappings=result, status='Regrade')

    def start(self, exam, qid):
        with self.access(exam, qid) as (conn, role):
            workflow.require(conn, exam, GRADING, 'Grading')
            # Papers may arrive after rubric creation. Initialize only real,
            # enrolled answers, without inventing a student or a decision.
            grading_db.seed_question_mappings(conn, qid, exam)
            row = grading_db.next_available_answer(conn, exam, qid, self.actor)
            if row is None:
                raise HTTPException(404, 'No available answers for this question')
            grading_db.claim_answer(conn, self.actor, exam, row['uid'], qid)
            return self._workspace(conn, exam, row['uid'], qid, role, writing=True)

    def release(self, exam, uid, qid):
        with self.access(exam, qid) as (conn, role):
            workflow.require(conn, exam, GRADING, 'Releasing an answer')
            state = self._workspace(conn, exam, uid, qid, role, writing=True)
            if state['assignment']['directory_id'] != self.actor:
                raise HTTPException(403, 'Only the owner can release an answer')
            if str(state['assignment']['status']).lower() == 'finished':
                raise HTTPException(409, 'Finished answers cannot be released')
            grading_db.release_answer(conn, exam, uid, qid)
            return {'released': True}

    def pdf(self, exam, uid, qid):
        with self.access(exam, qid) as (conn, role):
            self._workspace(conn, exam, uid, qid, role)
            row = studentpaper_db.paper_path(conn, exam, uid)
            if not row:
                raise HTTPException(404, 'Paper not found')
            root = config.DATA_DIR.resolve()
            path = Path(row['scanned_pdf'])
            path = (root / path).resolve() if not path.is_absolute() else path.resolve()
            if not path.is_relative_to(root) or path.suffix.lower() != '.pdf' or not path.is_file():
                raise HTTPException(404, 'PDF is unavailable')
            return path
