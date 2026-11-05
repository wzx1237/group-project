"""Exams and scans still live in the upload store (data/db.json); grading mirrors them into Postgres."""
from fastapi import HTTPException

from app import status, store


def _scans(assignment):
    """student uid -> scan path under data/, for every exam matched or assigned to a student."""
    files = {(u['id'], s['id']): s['filename'] for u in assignment['uploads'] for s in u.get('submissions', [])}
    folder = store.SUBMISSION_DIR.relative_to(store.DATA_DIR) / assignment['id']
    return {uid: (folder / found['upload_id'] / files[found['upload_id'], found['submission_id']]).as_posix()
            for uid, found in status.assigned_submissions(assignment).items()}


def resolve_exam(svc, assignment_id: str) -> int:
    """The Postgres exam for an upload-store ID like quiz-1, created along with its scanned papers when needed."""
    if assignment_id.isdigit():
        return int(assignment_id)
    data = store.load()
    assignment = next((a for a in data['assignments'] if a['id'] == assignment_id), None)
    if assignment is None:
        raise HTTPException(404, 'Assignment not found')
    scans = _scans(assignment)
    with svc.db.audit_context(actor_ID=svc.actor), svc.db.transaction():
        with svc.db.get_connection() as conn:
            course = conn.execute('''SELECT c.course_id FROM course c JOIN course_staff cs USING(course_id)
                WHERE c.code=%s AND c.term=%s AND cs.directory_id=%s''',
                                  (data['course']['code'], data['course']['term'], svc.actor)).fetchone()
            if course is None:
                raise HTTPException(403, 'Not a member of this exam course')
            course = course['course_id']
            conn.execute('''INSERT INTO exam(course_id,exam_name,due,slug) VALUES(%s,%s,%s,%s)
                ON CONFLICT (course_id,slug) DO UPDATE SET exam_name=EXCLUDED.exam_name,due=EXCLUDED.due
                WHERE (exam.exam_name,exam.due) IS DISTINCT FROM (EXCLUDED.exam_name,EXCLUDED.due)''',
                         (course, assignment['title'], assignment.get('due'), assignment_id))
            exam = conn.execute('SELECT exam_id FROM exam WHERE course_id=%s AND slug=%s FOR UPDATE',
                                (course, assignment_id)).fetchone()['exam_id']
            # Unassigning a scan keeps its paper, so grades already saved for it stay.
            conn.execute('''INSERT INTO studentpaper(exam_id,uid,scanned_pdf)
                SELECT %s,s.uid,s.path FROM unnest(%s::text[],%s::text[]) AS s(uid,path)
                JOIN enrollment en ON en.uid=s.uid AND en.course_id=%s
                ON CONFLICT (exam_id,uid) DO UPDATE SET scanned_pdf=EXCLUDED.scanned_pdf
                WHERE studentpaper.scanned_pdf IS DISTINCT FROM EXCLUDED.scanned_pdf''',
                         (exam, list(scans), list(scans.values()), course))
            conn.execute('''INSERT INTO mapping(exam_id,uid,qid,status)
                SELECT p.exam_id,p.uid,r.qid,'Pending' FROM studentpaper p JOIN rubric r USING(exam_id)
                JOIN exam e USING(exam_id) JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
                WHERE p.exam_id=%s ON CONFLICT DO NOTHING''', (exam,))
    return exam
