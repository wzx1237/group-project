"""Student reports: scores, the exam comment, applied criteria and question comments, then the scanned exam.

Internal notes, criteria that weren't applied, grader names and history are left out.
"""

from html import escape
from pathlib import Path
import io
import re

import pymupdf

from app import config
from app.database import reports as reports_db

CSS = """
* { font-family: sans-serif; }
h1 { font-size: 18px; margin: 0; }
p { margin: 0; font-size: 11px; }
.meta { color: #718084; margin-bottom: 12px; }
.total { font-size: 14px; margin: 12px 0 16px; }
.question { margin-top: 14px; }
.heading { font-size: 12px; font-weight: bold; }
.criterion { margin-top: 3px; }
.comment { margin-top: 4px; font-style: italic; }
.ungraded { margin-top: 3px; color: #718084; }
"""


def _order(qid):
    return [(0, int(part)) if part.isdigit() else (1, part) for part in qid.lstrip('Q').split('.')]


def points(n):
    return f'{float(n):g}'


def _questions(rubric):
    """Gradable questions in order, labelled Q1, Q2 and Q1(a), Q1(b) like the grading page."""
    rows = sorted(rubric, key=lambda q: _order(q['qid']))
    found = []
    for i, top in enumerate((q for q in rows if '.' not in q['qid']), 1):
        parts = [q for q in rows if q['qid'].startswith(top['qid'] + '.')]
        if not parts:
            found.append({**top, 'label': f'Q{i}'})
        for j, part in enumerate(parts):
            found.append({**part, 'label': f'Q{i}({chr(97 + j)})'})
    return found


def exam_reports(conn, exam, student=None):
    """The exam's details and one report per enrolled student with a scanned paper or marked a no-show, by name.

    A question counts as graded once its mapping is Finished, the same rule the assignment workflow uses.
    A no-show has no scan and scores 0 on every question.
    """
    info = reports_db.exam_info(conn, exam)
    questions = _questions(reports_db.exam_questions(conn, exam))
    info = {**info, 'questions': len(questions), 'possible': sum(q['total_scores'] or 0 for q in questions)}
    decisions = {(d['uid'], d['qid']): d for d in reports_db.exam_decisions(conn, exam)}
    finished = {(m['uid'], m['qid']) for m in reports_db.finished_answers(conn, exam)}
    applied = {}
    for row in reports_db.selected_label_details(conn, exam):
        applied.setdefault(row['record_id'], []).append(row)
    students = reports_db.exam_students(conn, exam, student)
    reports = []
    for s in students:
        rows = []
        for q in questions:
            d = decisions.get((s['uid'], q['qid']))
            graded = (s['uid'], q['qid']) in finished and d is not None and d['scores'] is not None
            if s['no_show']:
                rows.append({**q, 'score': 0, 'criteria': [], 'comment': None})
                continue
            rows.append({**q, 'score': d['scores'] if graded else None,
                         'criteria': applied.get(d['record_id'], []) if graded else [],
                         'comment': d['comments_remark'] if d else None})
        reports.append({**s, 'questions': rows,
                        'total': sum(r['score'] for r in rows if r['score'] is not None),
                        'possible': info['possible'],
                        'graded': sum(r['score'] is not None for r in rows)})
    return info, reports


def filename(report):
    return re.sub(r'[^A-Za-z0-9 ._()-]', '', f"{report['name']} ({report['uid']}).pdf")


def _scan(path):
    root = config.DATA_DIR.resolve()
    path = Path(path)
    path = (root / path).resolve() if not path.is_absolute() else path.resolve()
    return path if path.is_relative_to(root) and path.suffix.lower() == '.pdf' and path.is_file() else None


def _html(info, report):
    # include student section number in report header if present
    section_info = f" · Section {escape(str(report['section']))}" if report.get('section') else ''
    out = [f"<h1>{escape(info['exam_name'])}</h1>",
           f"<p class='meta'>{escape(info['code'])} · {escape(info['term'])}</p>",
           f"<p>{escape(report['name'])} · UID {escape(report['uid'])}{section_info}</p>",
           f"<p class='total'>Total score: <b>{points(report['total'])} / {points(report['possible'])}</b></p>"]
    if report['no_show']:
        out.append("<p class='ungraded'>Did not take this assignment; every question scores 0.</p>")
    if report['comment']:
        out.append(f"<p class='heading'>Comments</p><p class='comment'>{escape(report['comment'])}</p>")
    for q in report['questions']:
        title = f" · {escape(q['title'])}" if q['title'] else ''
        score = points(q['score']) if q['score'] is not None else '—'
        out.append(f"<div class='question'><p class='heading'>{q['label']}{title} — {score} / {points(q['total_scores'] or 0)}</p>")
        if q['score'] is None:
            out.append("<p class='ungraded'>Not graded</p>")
        for c in q['criteria']:
            deduction = c['deduction'] or 0
            amount = f"{'+' if deduction > 0 else ''}{points(deduction)}".replace('-', '−')
            unit = 'pt' if abs(deduction) == 1 else 'pts'
            out.append(f"<p class='criterion'>{amount} {unit} · {escape(c['title'])}</p>")
        if q['comment']:
            out.append(f"<p class='comment'>{escape(q['comment'])}</p>")
        out.append('</div>')
    return ''.join(out)


def report_pdf(info, report):
    """A summary page, followed by the student's scanned exam."""
    buffer = io.BytesIO()
    writer = pymupdf.DocumentWriter(buffer)
    story = pymupdf.Story(_html(info, report), user_css=CSS)
    page = pymupdf.paper_rect('letter')
    more = True
    while more:
        device = writer.begin_page(page)
        more, _ = story.place(page + (54, 54, -54, -54))
        story.draw(device)
        writer.end_page()
    writer.close()
    with pymupdf.open('pdf', buffer.getvalue()) as doc:
        scan = report['scanned_pdf'] and _scan(report['scanned_pdf'])
        if scan:
            with pymupdf.open(scan) as pages:
                doc.insert_pdf(pages)
        return doc.tobytes()
