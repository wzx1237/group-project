"""Assignment and student status (app.workflow) against PostgreSQL; each test owns an isolated schema."""
import contextlib
import csv
import io
import json
import os
import shutil
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app import assignments, config, db, rosters, store
from app.database import Database
from app.main import create_app
from app.processing import TEMPLATE_DIR
from app.routing.auth import current_user
from app.settings import Settings

real_user_courses = assignments.user_courses  # conftest replaces these with config.json stand-ins
real_students = rosters.students

ALICE, BOB, CAROL = '111111111', '222222222', '333333333'


@contextlib.contextmanager
def schema(dsn):
    name = 'wf_' + uuid.uuid4().hex[:12]
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(name)))
    try:
        yield make_conninfo(dsn, options=f'-c search_path={name}')
    finally:
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(name)))


@pytest.fixture
def dsn():
    found = os.environ.get('GRADEFLOW_TEST_DSN')
    if not found:
        pytest.skip('Set GRADEFLOW_TEST_DSN for native PostgreSQL tests')
    return found


@pytest.fixture
def wf(dsn, monkeypatch, tmp_path):
    """A course with a TA (ta), an instructor (teacher), three students and one draft assignment, quiz-1."""
    with schema(dsn) as scoped:
        db.migrate(scoped)
        pool = ConnectionPool(scoped, kwargs={'row_factory': dict_row}, min_size=1, max_size=4, open=True)
        pool.wait()
        monkeypatch.setenv('GRADEFLOW_AUDIT_DIR', str(tmp_path / 'audit'))
        monkeypatch.setattr(assignments, 'user_courses', real_user_courses)
        monkeypatch.setattr(rosters, 'students', real_students)
        monkeypatch.setattr(db, 'open_database', lambda url: contextlib.nullcontext(pool))
        monkeypatch.setattr(store, 'DB_PATH', tmp_path / 'db.json')
        database = Database.from_pool(pool)
        with database.get_connection() as conn:
            conn.execute("INSERT INTO staff VALUES ('ta','TA',NULL,'ta'),('teacher','Teacher',NULL,'instructor')")
            conn.execute("INSERT INTO course(code,term) VALUES ('CMSC250','Fall 2026')")
            conn.execute("INSERT INTO course_staff VALUES (1,'ta'),(1,'teacher')")
            conn.execute("INSERT INTO student(uid,name) VALUES (%s,'Alice'),(%s,'Bob'),(%s,'Carol')", (ALICE, BOB, CAROL))
            conn.execute('INSERT INTO enrollment(course_id,uid) VALUES (1,%s),(1,%s),(1,%s)', (ALICE, BOB, CAROL))
            conn.execute("INSERT INTO assignment(course_id,exam_name,slug,kind) VALUES (1,'Quiz 1','quiz-1','quiz')")
        app = create_app(Settings(_env_file=None, session_secret='wf-test'))
        actor = {'id': 'teacher'}
        app.dependency_overrides[current_user] = lambda: actor['id']
        try:
            with TestClient(app) as client:
                yield client, database, actor
        finally:
            database.flush_audit()
            pool.close()
            for folder in (store.UPLOAD_DIR / 'quiz-1', store.SUBMISSION_DIR / 'quiz-1'):
                shutil.rmtree(folder, ignore_errors=True)


def ready_to_publish(database):
    """Give quiz-1 a blank exam and one question with a region and a criterion."""
    with database.get_connection() as conn:
        conn.execute("UPDATE assignment SET blank_pdf='templates/quiz-1.pdf' WHERE exam_id=1")
        conn.execute("""INSERT INTO rubric(exam_id,qid,grading_method,total_scores,region)
            VALUES (1,'Q1','manual',10,'{"page":1}')""")
        conn.execute("INSERT INTO label(exam_id,title,deduction) VALUES (1,'Correct',10)")
        conn.execute("INSERT INTO rubric_label VALUES (1,'Q1',1)")


def move(client, status, confirm=False):
    return client.put('/api/assignments/quiz-1/status', json={'status': status, 'confirm': confirm})


def mark(client, uid, status):
    return client.put(f'/api/assignments/quiz-1/students/{uid}/status', json={'status': status})


def statuses(database):
    with database.get_connection() as conn:
        return {r['uid']: r['status'] for r in conn.execute('SELECT uid, status FROM assignment_student WHERE exam_id=1')}


def give_paper(database, uid, graded=True):
    """A matched student with a paper, its question mapped, and (if graded) a finished full-credit decision."""
    with database.get_connection() as conn:
        conn.execute("INSERT INTO studentpaper VALUES (1,%s,'paper.pdf',NULL)", (uid,))
        conn.execute("UPDATE assignment_student SET status='matched' WHERE exam_id=1 AND uid=%s", (uid,))
        conn.execute("INSERT INTO mapping VALUES (1,%s,'Q1','ta',%s)", (uid, 'Finished' if graded else 'Pending'))
        if graded:
            record = conn.execute("INSERT INTO decision(exam_id,uid,qid,scores) VALUES (1,%s,'Q1',10) RETURNING record_id",
                                  (uid,)).fetchone()['record_id']
            conn.execute("INSERT INTO decision_label VALUES (1,%s,1,'ta')", (record,))


def test_backfill_from_existing_rows(dsn, tmp_path):
    """Migrations 010 and 011 set each existing assignment's status and give past-draft ones a student row each."""
    before = tmp_path / 'before'
    before.mkdir()
    for path in sorted(db.MIGRATIONS.glob('*.sql')):
        if path.name < '010':
            shutil.copy(path, before / path.name)
    with schema(dsn) as scoped:
        db.migrate(scoped, before)
        with psycopg.connect(scoped, row_factory=dict_row) as conn:
            conn.execute("INSERT INTO course(code,term) VALUES ('C','T')")
            conn.execute("INSERT INTO student(uid,name) VALUES (%s,'A'),(%s,'B')", (ALICE, BOB))
            conn.execute('INSERT INTO enrollment(course_id,uid) VALUES (1,%s),(1,%s)', (ALICE, BOB))
            conn.execute("""INSERT INTO assignment(course_id,exam_name,slug,blank_pdf,released_at) VALUES
                (1,'Released','released',NULL,now()), (1,'Papers','papers',NULL,NULL),
                (1,'Ready','ready','blank.pdf',NULL), (1,'Blank only','blank-only','blank.pdf',NULL), (1,'Empty','empty',NULL,NULL)""")
            conn.execute("INSERT INTO studentpaper VALUES (2,%s,'p.pdf',NULL)", (ALICE,))
            conn.execute("INSERT INTO rubric(exam_id,qid,grading_method) VALUES (3,'Q1','manual')")
        assert db.migrate(scoped) == ['010_assignment_status.sql', '011_assignment_student.sql', '012_course_image.sql']
        with psycopg.connect(scoped, row_factory=dict_row) as conn:
            found = {r['slug']: r['status'] for r in conn.execute('SELECT slug, status FROM assignment')}
            assert found == {'released': 'closed', 'papers': 'grading', 'ready': 'collecting',
                             'blank-only': 'draft', 'empty': 'draft'}
            rows = {(r['exam_id'], r['uid']): r['status'] for r in conn.execute('SELECT * FROM assignment_student')}
            assert rows == {(1, ALICE): 'missing', (1, BOB): 'missing', (2, ALICE): 'matched', (2, BOB): 'missing',
                            (3, ALICE): 'missing', (3, BOB): 'missing'}
            with pytest.raises(psycopg.errors.CheckViolation):
                conn.execute("UPDATE assignment SET status='released' WHERE exam_id=1")


def test_publishing_needs_setup_and_an_instructor(wf):
    client, database, actor = wf
    refused = move(client, 'collecting')
    assert refused.status_code == 409
    assert refused.json()['detail']['problems'] == [
        'Upload the blank exam', 'Draw a region for at least one question', 'Every question needs at least one rubric criterion']
    assert statuses(database) == {}
    ready_to_publish(database)
    actor['id'] = 'ta'
    assert move(client, 'collecting').status_code == 403
    actor['id'] = 'teacher'
    published = move(client, 'collecting')
    assert published.status_code == 200, published.text
    assert published.json()['status'] == 'collecting'
    assert statuses(database) == {ALICE: 'missing', BOB: 'missing', CAROL: 'missing'}
    assert move(client, 'in_review').status_code == 409  # one step at a time


def test_full_workflow_with_excused_and_no_show(wf):
    client, database, actor = wf
    ready_to_publish(database)
    assert move(client, 'collecting').status_code == 200
    actor['id'] = 'ta'
    give_paper(database, ALICE)
    blocked = move(client, 'grading')
    assert blocked.status_code == 409 and blocked.json()['detail']['problems'] == ['2 students are missing or need review']

    assert mark(client, ALICE, 'excused').status_code == 409  # has an exam
    assert mark(client, BOB, 'excused').json()['status'] == 'excused'
    assert mark(client, CAROL, 'no_show').json() | {'set_at': None} == {
        'uid': CAROL, 'status': 'no_show', 'graded': True, 'questions': 1, 'finished': 0,
        'set_by': 'ta', 'set_at': None, 'note': None}
    assert move(client, 'grading').status_code == 200

    # Bob is excused, so grading can finish without him, but the assignment can't close until he has a grade.
    assert move(client, 'in_review').status_code == 200
    actor['id'] = 'teacher'
    blocked = move(client, 'closed')
    assert blocked.json()['detail']['problems'] == ['1 student has no grade (missing, excused or ungraded)']
    assert mark(client, BOB, None).json()['status'] == 'missing'
    assert mark(client, BOB, 'no_show').status_code == 200

    course = client.get('/api/courses').json()[0]['assignments'][0]
    assert course['progress'] == {'graded': 3, 'total': 3, 'students': {'matched': 1, 'no_show': 2}}

    closed = move(client, 'closed')
    assert closed.status_code == 200, closed.text
    assert closed.json()['status'] == 'closed' and closed.json()['released_at']
    assert mark(client, BOB, None).status_code == 409  # closed is locked

    # No-shows are 0 in the grade export; Alice has full credit.
    rows = list(csv.DictReader(io.StringIO(client.get('/api/assignments/quiz-1/grades.csv').content.decode('utf-8-sig'))))
    assert {r['UID']: r['Points'] for r in rows} == {ALICE: '10', BOB: '0', CAROL: '0'}
    assert client.get(f'/api/assignments/quiz-1/reports/{CAROL}.pdf').status_code == 200

    # Moving back is instructor-only and needs confirmation; reopening hides the grades again.
    actor['id'] = 'ta'
    assert move(client, 'in_review', confirm=True).status_code == 403
    actor['id'] = 'teacher'
    unconfirmed = move(client, 'in_review')
    assert unconfirmed.status_code == 409 and unconfirmed.json()['detail']['confirm_required']
    reopened = move(client, 'in_review', confirm=True)
    assert (reopened.json()['status'], reopened.json()['released_at']) == ('in_review', None)


def test_grading_and_setup_are_locked_by_status(wf):
    client, database, actor = wf
    ready_to_publish(database)
    rubric = '/api/assignments/quiz-1/rubric'
    assert client.post(rubric + '/questions', json={'qid': 'Q2', 'total_score': 5}).status_code == 201  # draft
    assert client.post(rubric + '/questions/Q2/criteria', json={'title': 'Right', 'deduction': 5}).status_code == 201
    assert move(client, 'collecting').status_code == 200
    assert client.post(rubric + '/questions', json={'qid': 'Q3', 'total_score': 5}).status_code == 409
    # Criteria stay editable after publishing.
    assert client.post(rubric + '/questions/Q2/criteria', json={'title': 'Half', 'deduction': 2}).status_code == 201
    pdf = {'file': ('blank.pdf', b'%PDF-1.4\n%%EOF', 'application/pdf')}
    assert client.post('/api/assignments/quiz-1/templates', files=pdf, data={'type': 'blank_exam'}).status_code == 409
    give_paper(database, ALICE, graded=False)
    grade = client.put(f'/api/assignments/quiz-1/submissions/{ALICE}/questions/Q1/decision', json={'criteria': ['1']})
    assert grade.status_code == 409  # not grading yet


def test_matching_writes_student_status(wf):
    client, database, actor = wf
    ready_to_publish(database)
    actor['id'] = 'ta'
    files = {'file': ('scan.pdf', (TEMPLATE_DIR / 'quiz-1.pdf').read_bytes(), 'application/pdf')}
    assert client.post('/api/assignments/quiz-1/uploads', files=files).status_code == 409  # draft
    actor['id'] = 'teacher'
    assert move(client, 'collecting').status_code == 200
    actor['id'] = 'ta'
    assert client.post('/api/assignments/quiz-1/uploads', files=files).status_code == 201
    [upload] = client.get('/api/assignments/quiz-1').json()['uploads']
    assert upload['matching'] == 'done', upload['matching_error']
    [scan] = upload['submissions']
    exam = f"/api/assignments/quiz-1/uploads/{upload['id']}/submissions/{scan['id']}"
    assert move(client, 'grading').json()['detail']['problems'] == [
        '3 students are missing or need review', '1 scan is waiting to be matched']

    # Assigning the scan to an excused student is their makeup: they become matched.
    assert mark(client, ALICE, 'excused').status_code == 200
    assert client.post(exam + '/assign', json={'student_uid': ALICE}).status_code == 200
    assert statuses(database) == {ALICE: 'matched', BOB: 'missing', CAROL: 'missing'}
    roster = {s['uid']: s for s in client.get('/api/assignments/quiz-1/roster').json()['students']}
    assert roster[ALICE]['status'] == 'matched' and roster[ALICE]['submission']['submission_id'] == scan['id']

    # Grading routes copy the scan in as a paper; unassigning drops it again so Alice leaves the queues.
    assert client.get('/api/assignments/quiz-1/queue').status_code == 200
    assert client.post(exam + '/unassign').status_code == 200
    assert statuses(database) == {ALICE: 'missing', BOB: 'missing', CAROL: 'missing'}
    with database.get_connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM studentpaper').fetchone()['n'] == 0

    assert client.post(exam + '/assign', json={'student_uid': BOB}).status_code == 200
    assert mark(client, ALICE, 'no_show').status_code == 200
    assert mark(client, CAROL, 'excused').status_code == 200
    assert move(client, 'grading').status_code == 200
    # Past collecting, scans are fixed.
    assert client.post(exam + '/unassign').status_code == 409
    assert client.post('/api/assignments/quiz-1/uploads', files=files).status_code == 409


def test_roster_additions_get_a_missing_row_and_an_audit_trail(wf, tmp_path):
    client, database, _ = wf
    ready_to_publish(database)
    assert move(client, 'collecting').status_code == 200
    added = client.post('/api/courses/1/roster', json={'uid': '444444444', 'name': 'Dave'})
    assert added.status_code == 201, added.text
    assert statuses(database)['444444444'] == 'missing'
    database.flush_audit()
    events = [json.loads(line) for f in (tmp_path / 'audit').glob('audit-*.jsonl') for line in f.read_text().splitlines()]
    added = [e for e in events if e['table'] == 'assignment_student' and e.get('row_key', {}).get('uid') == '444444444']
    assert [(e['actor_id'], e['new_data']['status']) for e in added] == [('teacher', 'missing')]


def test_restart_sync_catches_up_on_matches(wf, dsn):
    client, database, _ = wf
    ready_to_publish(database)
    assert move(client, 'collecting').status_code == 200
    # A match saved to the upload store whose SQL sync never ran (say the server stopped in between).
    store.update(lambda data: store.entry(data, 'quiz-1')['uploads'].append({
        'id': 'u1', 'status': 'processed', 'matching': 'done',
        'submissions': [{'id': 's1', 'filename': 's1.pdf', 'match': {'state': 'matched', 'student_uid': CAROL}},
                        {'id': 's2', 'filename': 's2.pdf',
                         'match': {'state': 'needs_review', 'student_uid': None, 'suggestion': BOB}}]}))
    assert statuses(database) == {ALICE: 'missing', BOB: 'missing', CAROL: 'missing'}
    with TestClient(client.app):
        pass
    assert statuses(database) == {ALICE: 'missing', BOB: 'needs_review', CAROL: 'matched'}
