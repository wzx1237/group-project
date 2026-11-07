"""Assignments live in Postgres; their uploaded scans still live in the upload store (data/db.json) and are mirrored in as papers."""

from fastapi import HTTPException

from app import status, store
from app.database import exam as exam_db
from app.database import grading as grading_db
from app.database import studentpaper as studentpaper_db


def _scans(assignment):
    """student uid -> scan path under data/, for every exam matched or assigned to a student."""
    files = {(u['id'], s['id']): s['filename'] for u in assignment['uploads'] for s in u.get('submissions', [])}
    folder = store.SUBMISSION_DIR.relative_to(store.DATA_DIR) / assignment['id']
    return {uid: (folder / found['upload_id'] / files[found['upload_id'], found['submission_id']]).as_posix()
            for uid, found in status.assigned_submissions(assignment).items()}


def resolve_exam(svc, assignment_id: str) -> int:
    """The Postgres assignment for a slug like quiz-1, with its scanned papers brought in from the upload store."""
    if assignment_id.isdigit():
        return int(assignment_id)
    stored = next((a for a in store.load()['assignments'] if a['id'] == assignment_id),
                  {'id': assignment_id, 'uploads': []})
    scans = _scans(stored)
    with svc.db.audit_context(actor_ID=svc.actor), svc.db.transaction():
        with svc.db.get_connection() as conn:
            found = exam_db.lock_assignment_by_slug(conn, assignment_id, svc.actor)
            if found is None:
                raise HTTPException(404, 'Assignment not found')
            exam, course = found['exam_id'], found['course_id']
            # Unassigning a scan keeps its paper, so grades already saved for it stay.
            studentpaper_db.sync_scanned_papers(conn, exam, list(scans), list(scans.values()), course)
            grading_db.seed_exam_mappings(conn, exam)
    return exam
