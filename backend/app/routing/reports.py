import csv
import io
import tempfile
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from app.grading.exams import resolve_exam
from app.grading.reports import exam_reports, filename, points, report_pdf
from app.routing.auth import current_user
from app.routing.grading import Service

router = APIRouter(prefix='/api/assignments/{assignment_id}', dependencies=[Depends(current_user)])


class ReleaseIn(BaseModel):
    released: bool


@router.get('/release')
def release_status(assignment_id: str, svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        return conn.execute('SELECT released_at FROM assignment WHERE exam_id=%s', (exam,)).fetchone()


@router.put('/release')
def set_release(assignment_id: str, body: ReleaseIn, svc: Service):
    """Releasing keeps the first release time; the change log records who did it."""
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        return conn.execute('''UPDATE assignment SET released_at=CASE WHEN %s THEN COALESCE(released_at, clock_timestamp()) END
            WHERE exam_id=%s RETURNING released_at''', (body.released, exam)).fetchone()


@router.get('/reports/{student_uid}.pdf')
def student_report(assignment_id: str, student_uid: str, svc: Service, download: bool = False):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        info, reports = exam_reports(conn, exam, student_uid)
    if not reports:
        raise HTTPException(404, 'No scanned exam for this student')
    disposition = 'attachment' if download else 'inline'
    return Response(report_pdf(info, reports[0]), media_type='application/pdf',
                    headers={'Content-Disposition': f'{disposition}; filename="{filename(reports[0])}"'})


@router.get('/reports.zip')
def all_reports(assignment_id: str, svc: Service):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        info, reports = exam_reports(conn, exam)
    # Each report carries a full scan, so a class adds up to gigabytes: build the ZIP on disk.
    # Scans are already compressed, so the PDFs are stored as they are.
    file = tempfile.TemporaryFile()
    with zipfile.ZipFile(file, 'w') as archive:
        for report in reports:
            archive.writestr(filename(report), report_pdf(info, report))
    file.seek(0)
    return StreamingResponse(_chunks(file), media_type='application/zip',
                             headers={'Content-Disposition': f'attachment; filename="{assignment_id} reports.zip"'})


def _chunks(file):
    with file:
        while chunk := file.read(1 << 20):
            yield chunk


@router.get('/grades.csv')
def grades_csv(assignment_id: str, svc: Service):
    """Every enrolled student's grade; points and percentage stay blank until all their questions are graded."""
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        info, reports = exam_reports(conn, exam)
        students = conn.execute('''SELECT s.uid, s.name, s.email FROM student s JOIN enrollment en USING(uid)
            JOIN assignment e ON e.course_id=en.course_id WHERE e.exam_id=%s ORDER BY s.name, s.uid''', (exam,)).fetchall()
    graded = {r['uid']: r['total'] for r in reports if info['questions'] and r['graded'] == info['questions']}
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(['Name', 'Email', 'UID', 'Percentage', 'Out of', 'Points'])
    for s in students:
        total = graded.get(s['uid'])
        percent = points(round(100 * total / info['possible'], 2)) if total is not None and info['possible'] else ''
        writer.writerow([s['name'], s['email'] or '', s['uid'], percent, points(info['possible']),
                         '' if total is None else points(total)])
    return Response(out.getvalue().encode('utf-8-sig'), media_type='text/csv',
                    headers={'Content-Disposition': f'attachment; filename="{assignment_id} grades.csv"'})
