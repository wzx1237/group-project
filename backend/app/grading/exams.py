"""Assignments live in Postgres; their uploaded scans still live in the upload store (data/db.json) and are mirrored in as papers."""
from fastapi import HTTPException

from app import status, store


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
                  {'id': assignment_id, 'uploads': [], 'statuses': {}})
    scans = _scans(stored)
    with svc.db.audit_context(actor_ID=svc.actor), svc.db.transaction():
        with svc.db.get_connection() as conn:
            found = conn.execute('''SELECT a.exam_id, a.course_id FROM assignment a JOIN course_staff cs USING(course_id)
                WHERE a.slug=%s AND cs.directory_id=%s ORDER BY a.course_id LIMIT 1 FOR UPDATE OF a''',
                                 (assignment_id, svc.actor)).fetchone()
            if found is None:
                raise HTTPException(404, 'Assignment not found')
            exam, course = found['exam_id'], found['course_id']
            # Unassigning a scan keeps its paper, so grades already saved for it stay.
            conn.execute('''INSERT INTO studentpaper(exam_id,uid,scanned_pdf)
                SELECT %s,s.uid,s.path FROM unnest(%s::text[],%s::text[]) AS s(uid,path)
                JOIN enrollment en ON en.uid=s.uid AND en.course_id=%s
                ON CONFLICT (exam_id,uid) DO UPDATE SET scanned_pdf=EXCLUDED.scanned_pdf
                WHERE studentpaper.scanned_pdf IS DISTINCT FROM EXCLUDED.scanned_pdf''',
                         (exam, list(scans), list(scans.values()), course))
            conn.execute('''INSERT INTO mapping(exam_id,uid,qid,status)
                SELECT p.exam_id,p.uid,r.qid,'Pending' FROM studentpaper p JOIN rubric r USING(exam_id)
                JOIN assignment e USING(exam_id) JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
                WHERE p.exam_id=%s ON CONFLICT DO NOTHING''', (exam,))
    return exam
