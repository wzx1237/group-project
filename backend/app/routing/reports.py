import csv
import io
import tempfile
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse

from app.grading.exams import resolve_exam
from app.grading.reports import exam_reports, filename, points, report_pdf
from app.routing.auth import current_user
from app.routing.grading import Service
from app.database import exam as exam_db
from app.database import reports as reports_db

router = APIRouter(prefix='/api/assignments/{assignment_id}', dependencies=[Depends(current_user)])


@router.get('/release')
def release_status(assignment_id: str, svc: Service):
    """When grades were released, which is when the assignment was closed. Closing and reopening go through
    PUT /api/assignments/{assignment_id}/status."""
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        return exam_db.release_status(conn, exam)


@router.get('/reports/{student_uid}.pdf')
def student_report(assignment_id: str, student_uid: str, svc: Service, download: bool = False):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        info, reports = exam_reports(conn, exam, student_uid)
    if not reports:
        raise HTTPException(404, 'No scanned exam or no-show for this student')
    disposition = 'attachment' if download else 'inline'
    return Response(report_pdf(info, reports[0]), media_type='application/pdf',
                    headers={'Content-Disposition': f'{disposition}; filename="{filename(reports[0])}"'})


@router.get('/reports.zip')
def all_reports(assignment_id: str, svc: Service, section: str | None = None, grouped: bool = False):
    exam = resolve_exam(svc, assignment_id)
    with svc.access(exam) as (conn, _):
        info, reports = exam_reports(conn, exam)

    # filter reports by section if specified
    if section:
        target = section.strip()
        if target.lower() in ('unassigned', 'none', 'no-section'):
            reports = [r for r in reports if not (r.get('section') or '').strip()]
        else:
            reports = [r for r in reports if (r.get('section') or '').strip() == target]

    # each report carries a full scan, so build the zip on disk
    file = tempfile.TemporaryFile()
    with zipfile.ZipFile(file, 'w') as archive:
        for report in reports:
            # group reports into section folders when requested
            if grouped and not section:
                sec = (report.get('section') or '').strip()
                folder = f'Section {sec}' if sec else 'Unassigned'
                arcname = f'{folder}/{filename(report)}'
            else:
                arcname = filename(report)
            archive.writestr(arcname, report_pdf(info, report))
    file.seek(0)

    # determine zip download filename
    if section:
        disp_name = f'{assignment_id} section {section} reports.zip'
    elif grouped:
        disp_name = f'{assignment_id} reports (grouped by section).zip'
    else:
        disp_name = f'{assignment_id} reports.zip'

    return StreamingResponse(_chunks(file), media_type='application/zip',
                             headers={'Content-Disposition': f'attachment; filename="{disp_name}"'})


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
        students = reports_db.enrolled_contacts(conn, exam)
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
