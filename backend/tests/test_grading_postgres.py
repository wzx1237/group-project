"""Opt-in native PostgreSQL integration tests; each test owns an isolated schema."""
import contextlib
from concurrent.futures import ThreadPoolExecutor
import json
import os
import threading
import time
import uuid

import psycopg
import pymupdf
from psycopg import sql
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import config, db
from app.database import Database
from app.database import grading as grading_db
from app.database import studentpaper as studentpaper_db
from app.grading.service import GradingService
from app.main import create_app
from app.routing.auth import current_user
from app.settings import Settings


@pytest.fixture
def native(monkeypatch, tmp_path):
    dsn = os.environ.get('GRADEFLOW_TEST_DSN')
    if not dsn:
        pytest.skip('Set GRADEFLOW_TEST_DSN for native PostgreSQL tests')
    schema = 'grading_test_' + uuid.uuid4().hex
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    scoped = make_conninfo(dsn, options=f'-c search_path={schema}')
    db.migrate(scoped)
    assert db.migrate(scoped) == []
    pool = ConnectionPool(scoped, kwargs={'row_factory': dict_row}, min_size=1, max_size=8, open=True)
    pool.wait()
    monkeypatch.setenv('GRADEFLOW_AUDIT_DIR', str(tmp_path / 'audit'))
    monkeypatch.setattr(config, 'DATA_DIR', tmp_path)
    database = Database.from_pool(pool)
    with database.get_connection() as conn:
        conn.execute("INSERT INTO staff VALUES ('alice','Alice',NULL,'ta'),('bob','Bob',NULL,'ta'),('teacher','Teacher',NULL,'instructor')")
        conn.execute("INSERT INTO course(code,term) VALUES ('CMSC','Fall'),('OTHER','Fall')")
        conn.execute("INSERT INTO course_staff VALUES (1,'alice'),(1,'bob'),(1,'teacher')")
        # Grading is only allowed while an assignment is grading or in review (app.workflow).
        conn.execute("""INSERT INTO assignment(course_id,exam_name,slug,status)
            VALUES (1,'Exam','exam-1','grading'),(2,'Other Exam','other-exam','grading')""")
        conn.execute("INSERT INTO student(uid,name) VALUES ('123456789','Student'),('234567890','Student Two')")
        conn.execute("INSERT INTO enrollment VALUES (1,123456789),(1,234567890)")
        conn.execute("INSERT INTO studentpaper VALUES (1,123456789,'paper.pdf',NULL),(1,234567890,'paper.pdf',NULL)")
        conn.execute("INSERT INTO rubric(exam_id,qid,grading_method,total_scores) VALUES (1,'Q1','manual',5),(1,'Q2','manual',5)")
        conn.execute("INSERT INTO mapping VALUES (1,123456789,'Q1','alice','Pending'),(1,234567890,'Q1',NULL,'Pending')")
        conn.execute("INSERT INTO label(exam_id,title,deduction) VALUES (1,'Credit',5),(1,'Deduct',-1),(1,'Other question',2)")
        conn.execute("INSERT INTO rubric_label VALUES (1,'Q1',1),(1,'Q1',2),(1,'Q2',3)")
    (tmp_path / 'paper.pdf').write_bytes(b'%PDF-1.4\n%%EOF')
    monkeypatch.setattr(db, 'open_database', lambda url: contextlib.nullcontext(pool))
    app = create_app(Settings(_env_file=None, session_secret='native-test'))
    app.dependency_overrides[current_user] = lambda: 'alice'
    try:
        with TestClient(app) as client:
            yield client, database, scoped, tmp_path, app
    finally:
        database.flush_audit()
        pool.close()
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


BASE = '/api/exams/1/students/123456789/questions/Q1'
RUBRIC = '/api/exams/1/questions/Q1/rubric'


def save(client, labels, *, regrade=False, snapshot=None):
    snapshot = snapshot or client.get(BASE + '/workspace').json()
    return client.request('PUT' if regrade else 'POST', BASE + '/grade',
        headers={'If-Match': snapshot['grade_token']}, json={'labels': labels, 'comments': 'Reviewed'})


def set_status(database, status):
    with database.get_connection() as conn:
        conn.execute('UPDATE assignment SET status=%s WHERE exam_id=1', (status,))


def test_grade_rubric_regrade_and_persistence(native):
    client, database, _, path, _ = native
    assert [c['course_id'] for c in client.get('/api/courses').json()] == [1]
    questions = client.get('/api/courses/1/questions')
    assert questions.status_code == 200, questions.text
    assert {q['qid'] for q in questions.json()} == {'Q1','Q2'}
    start = client.post('/api/exams/1/questions/Q1/start')
    assert start.status_code == 200, start.text
    state = start.json()
    assert state['UID'] == '123456789'
    assert client.get(state['pdf_url']).content.startswith(b'%PDF')
    response = save(client, [1,2], snapshot=state)
    assert response.status_code == 201, response.text
    assert response.json()['score'] == 4
    record = response.json()['record_ID']
    old = client.get(BASE + '/workspace').json()
    changed = client.post(RUBRIC + '/labels', headers={'If-Match': old['rubric_token']},
                          json={'title': 'New criterion', 'deduction': '-2.00'})
    assert changed.status_code == 201, changed.text
    assert changed.json()['affected_mappings'] == 2
    current = client.get(BASE + '/workspace').json()
    assert current['assignment']['status'] == 'Regrade'
    assert current['decision']['scores'] == 4
    assert len(current['selected_labels']) == 2
    assert save(client, [1], regrade=True, snapshot=old).status_code == 412
    result = save(client, [1,changed.json()['label_ID']], regrade=True)
    assert result.status_code == 200, result.text
    assert result.json()['score'] == 3 and result.json()['record_ID'] == record
    assert client.get(BASE + '/workspace').json()['assignment']['status'] == 'Finished'
    with database.get_connection() as conn:
        assert conn.execute('SELECT scores FROM decision WHERE record_id=%s', (record,)).fetchone()['scores'] == 3
    events = [json.loads(line) for f in (path / 'audit').glob('audit-*.jsonl') for line in f.read_text().splitlines()]
    assert any(e['table'] == 'decision_label' and e['operation'] == 'DELETE' and e['actor_id'] == 'alice' for e in events)


def test_validation_auth_and_no_partial_writes(native):
    client, database, _, _, app = native
    state = client.get(BASE + '/workspace').json()
    assert client.post(BASE + '/grade', json={'labels': [1]}).status_code == 428
    assert save(client, [3]).status_code == 422
    assert save(client, [1,1]).status_code == 422
    assert client.post(BASE + '/grade', headers={'If-Match': state['grade_token']},
                      json={'labels': [1], 'directory_ID': 'bob'}).status_code == 403
    assert client.get('/api/exams/2/questions/Q1/rubric').status_code == 403
    assert client.get('/api/courses/2/questions').status_code == 403
    for value in ['NaN','1000','1.001']:
        assert client.post(RUBRIC + '/labels', headers={'If-Match': state['rubric_token']},
                          json={'title': 'Invalid', 'deduction': value}).status_code == 422
    with database.get_connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM decision').fetchone()['n'] == 0
        assert conn.execute('SELECT count(*) AS n FROM label').fetchone()['n'] == 3
    app.dependency_overrides[current_user] = lambda: 'bob'
    # TAs can open an answer assigned to another TA; start still skips it.
    assert client.get(BASE + '/workspace').status_code == 200
    claimed = client.post('/api/exams/1/questions/Q1/start')
    assert claimed.status_code == 200 and claimed.json()['UID'] == '234567890'
    app.dependency_overrides.clear()
    assert client.get('/api/courses').status_code == 401


def test_empty_labels_replay_and_pdf_confinement(native):
    client, database, _, _, _ = native
    state = client.get(BASE + '/workspace').json()
    result = save(client, [], snapshot=state)
    # No labels means not graded yet, so there is no score.
    assert result.status_code == 201 and result.json()['score'] is None
    assert save(client, [1], snapshot=state).status_code == 412
    assert save(client, [1]).status_code == 409
    assert save(client, [], regrade=True).status_code == 200
    with database.get_connection() as conn:
        conn.execute("UPDATE studentpaper SET scanned_pdf='/etc/passwd' WHERE exam_id=1 AND uid='123456789'")
    assert client.get(BASE + '/pdf').status_code == 404


def test_same_snapshot_concurrent_grades(native):
    _, database, _, _, _ = native
    svc = GradingService(database, 'alice')
    state = svc.workspace(1,'123456789','Q1')
    barrier = threading.Barrier(2)
    def run(_):
        barrier.wait(timeout=5)
        try:
            svc.save(1,'123456789','Q1',[1],None,state['grade_token'])
            return 201
        except HTTPException as error:
            return error.status_code
    with ThreadPoolExecutor(2) as workers:
        assert sorted(workers.map(run, range(2))) == [201,412]
    with database.get_connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM decision').fetchone()['n'] == 1


def test_rubric_edit_invalidates_a_waiting_grade(native):
    _, database, dsn, _, _ = native
    svc = GradingService(database, 'alice')
    state = svc.workspace(1,'123456789','Q1')
    with psycopg.connect(dsn, row_factory=dict_row) as blocker:
        blocker.execute("SELECT * FROM rubric WHERE exam_id=1 AND qid='Q1' FOR NO KEY UPDATE")
        with ThreadPoolExecutor(1) as workers:
            future = workers.submit(svc.save,1,'123456789','Q1',[1],None,state['grade_token'])
            blocker_pid = blocker.info.backend_pid
            with psycopg.connect(dsn, autocommit=True) as monitor:
                deadline = time.monotonic() + 4
                while time.monotonic() < deadline:
                    waiting = monitor.execute(
                        "SELECT count(*) FROM pg_stat_activity WHERE %s=ANY(pg_blocking_pids(pid))",
                        (blocker_pid,)).fetchone()[0]
                    if waiting:
                        break
                    time.sleep(.02)
                assert waiting, 'Grade must actually wait for the rubric row lock'
            blocker.execute("UPDATE label SET deduction=4 WHERE label_id=1")
            blocker.execute("UPDATE mapping SET status='Regrade' WHERE exam_id=1 AND qid='Q1'")
            blocker.commit()
            with pytest.raises(HTTPException) as error:
                future.result(timeout=10)
            assert error.value.status_code == 412
    assert svc.workspace(1,'123456789','Q1')['assignment']['status'] == 'Regrade'


def test_rollback_includes_grade_and_audit(native, monkeypatch):
    _, database, _, path, _ = native
    def fail(*args, **kwargs):
        raise RuntimeError('simulated failure after decision insert')
    monkeypatch.setattr(Database, 'update_assignment_status', fail)
    svc = GradingService(database, 'alice')
    state = svc.workspace(1,'123456789','Q1')
    with pytest.raises(RuntimeError):
        svc.save(1,'123456789','Q1',[1],None,state['grade_token'])
    with database.get_connection() as conn:
        assert conn.execute('SELECT count(*) AS n FROM decision').fetchone()['n'] == 0
        assert conn.execute('SELECT count(*) AS n FROM decision_label').fetchone()['n'] == 0
    events = [json.loads(line) for f in (path / 'audit').glob('audit-*.jsonl') for line in f.read_text().splitlines()]
    assert not any(e['table'] == 'decision' for e in events)


def test_staff_question_creation_and_release(native):
    client, database, _, _, app = native
    # Questions are added while the assignment is a draft, never once grading has started.
    assert client.post('/api/exams/1/rubric/questions', json={'qid':'Q3','total_score':'10'}).status_code == 409
    set_status(database, 'draft')
    # TAs and instructors have the same rubric permissions.
    created = client.post('/api/exams/1/rubric/questions', json={'qid':'Q3','total_score':'10'})
    assert created.status_code == 201, created.text
    app.dependency_overrides[current_user] = lambda: 'teacher'
    assert client.post('/api/exams/1/rubric/questions',
                       json={'qid':'Q3','total_score':'10'}).status_code == 409
    set_status(database, 'grading')
    app.dependency_overrides[current_user] = lambda: 'bob'
    state = client.post('/api/exams/1/questions/Q3/start').json()
    base = f"/api/exams/1/students/{state['UID']}/questions/Q3"
    assert client.post(base + '/release').status_code == 200
    with database.get_connection() as conn:
        row = conn.execute("SELECT * FROM mapping WHERE exam_id=1 AND uid=%s AND qid='Q3'",
                           (state['UID'],)).fetchone()
        assert row['directory_id'] is None and row['status'] == 'Pending'
    # Revoking course membership takes effect on the next request.
    with database.get_connection() as conn:
        conn.execute("DELETE FROM course_staff WHERE course_id=1 AND directory_id='bob'")
    assert client.post('/api/exams/1/questions/Q3/start').status_code == 403


def test_rubric_change_waits_for_grade_then_requeues(native):
    _, database, dsn, _, _ = native
    svc = GradingService(database, 'alice')
    state = svc.workspace(1,'123456789','Q1')
    with psycopg.connect(dsn) as blocker, psycopg.connect(dsn, autocommit=True) as monitor:
        blocker.execute("SELECT * FROM mapping WHERE exam_id=1 AND uid='123456789' AND qid='Q1' FOR UPDATE")
        with ThreadPoolExecutor(2) as workers:
            grade = workers.submit(svc.save,1,'123456789','Q1',[1],None,state['grade_token'])
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                waiting = monitor.execute(
                    "SELECT count(*) FROM pg_stat_activity WHERE %s=ANY(pg_blocking_pids(pid))",
                    (blocker.info.backend_pid,)).fetchone()[0]
                if waiting:
                    break
                time.sleep(.02)
            assert waiting, 'Grade must hold the shared rubric lock while waiting for its answer'
            edit = workers.submit(svc.change_rubric,1,'Q1','New criterion',None,-1,state['rubric_token'])
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                chain = monitor.execute('''SELECT count(*) FROM pg_stat_activity a
                    WHERE EXISTS (SELECT 1 FROM pg_stat_activity b
                    WHERE b.pid=ANY(pg_blocking_pids(a.pid))
                    AND %s=ANY(pg_blocking_pids(b.pid)))''', (blocker.info.backend_pid,)).fetchone()[0]
                if chain:
                    break
                time.sleep(.02)
            # Always unblock before assertions so a failed test cannot strand workers.
            blocker.commit()
            assert chain, 'Rubric edit must actually wait for the grading transaction'
            assert grade.result(timeout=10)['score'] == 5
            assert edit.result(timeout=10)['affected_mappings'] == 2
    current = svc.workspace(1,'123456789','Q1')
    assert current['assignment']['status'] == 'Regrade'
    assert current['decision']['scores'] == 5


def test_frontend_rubric_edit_recalculates_and_keeps_notes_private(native):
    client, database, _, _, app = native
    app.dependency_overrides[current_user] = lambda: 'teacher'
    base='/api/assignments/1/rubric'
    assert client.get(base).status_code == 200
    set_status(database, 'draft')
    created=client.post(base+'/questions',json={'qid':'Q9','title':'Chain rule','total_score':5})
    assert created.status_code==201,created.text
    assert created.json()['title']=='Chain rule'
    set_status(database, 'grading')
    # A question's title and points can change during grading, but not its region or whether it exists.
    assert client.patch(base+'/questions/Q9',json={'qid':'Q9','title':'Derivative','total_score':6}).status_code==200
    assert client.patch(base+'/questions/Q9',json={'qid':'Q9','total_score':6,'region':{'page':1}}).status_code==409
    assert client.delete(base+'/questions/Q9').status_code==409
    url='/api/assignments/1/submissions/123456789/questions/Q1/decision'
    saved=client.put(url,json={'criteria':['1','2'],'comment':'Public','internal_note':'Private'})
    assert saved.status_code==200,saved.text
    assert saved.json()['score']==4
    assert saved.json()['comment']=='Public' and saved.json()['internal_note']=='Private'
    edited=client.patch(base+'/criteria/2',json={'title':'Deduction','deduction':-2})
    assert edited.status_code==200,edited.text
    assert client.get('/api/assignments/1/submissions/123456789/questions/Q1').json()['score']==3
    assert client.delete(base+'/criteria/1').status_code==204
    # Only the -2 label is left, and a score never goes below 0.
    assert database.get_decision_by_student_question('123456789','Q1',exam_ID=1)['scores']==0
    assert client.delete(base+'/criteria/2').status_code==204
    assert database.get_decision_by_student_question('123456789','Q1',exam_ID=1)['scores'] is None
    set_status(database, 'draft')
    assert client.delete(base+'/questions/Q9').status_code==204
    app.dependency_overrides[current_user] = lambda: 'alice'
    assert client.patch(base+'/criteria/3',json={'title':'TA edit','deduction':0}).status_code==200


def test_text_uid_base_methods_and_borrowed_pool(native):
    _,database,_,_,_=native
    assert database.add_staff('NEWTA','New',role='ta')
    assert database.add_staff_to_course(1,'newta')
    assert database.get_staff('newta')['courses'][0]['role']=='ta'
    assert database.add_student('012345678','Leading zero')
    assert database.get_student('012345678')['uid']=='012345678'
    database.close()
    assert database.get_student('012345678')['uid']=='012345678'


def test_label_recalculation_failure_rolls_back_definition(native, monkeypatch):
    client,database,_,_,_=native
    assert save(client,[1,2]).status_code==201
    # Capped scores can't overflow, so fail the recalculation directly.
    # It must roll back the label and every derived score.
    def fail(*args):
        raise psycopg.errors.NumericValueOutOfRange('recalculation failed')
    from app.database import decision
    monkeypatch.setattr(decision, '_recalculate_score', fail)
    with pytest.raises(psycopg.errors.NumericValueOutOfRange):
        database.edit_label(2,'Too large',None,999,exam_ID=1)
    assert database.get_label(2,exam_ID=1)['deduction']==-1
    assert database.get_decision_by_student_question('123456789','Q1',exam_ID=1)['scores']==4


def test_exam_comment_is_per_student_and_on_the_report(native):
    client, database, _, path, _ = native
    url = '/api/assignments/1/submissions/123456789/comment'
    assert client.get(url).json() == {'comment': None}
    saved = client.put(url, json={'comment': '  Strong work overall.  '})
    assert saved.status_code == 200, saved.text
    assert saved.json() == {'comment': 'Strong work overall.'}
    assert client.get(url).json() == {'comment': 'Strong work overall.'}
    # Another student's paper on the same exam keeps its own comment.
    assert client.get('/api/assignments/1/submissions/234567890/comment').json() == {'comment': None}
    assert client.put(url, json={'comment': 'x' * 10001}).status_code == 422
    assert client.get('/api/assignments/1/submissions/999999999/comment').status_code == 404
    assert client.get('/api/assignments/2/submissions/123456789/comment').status_code == 403
    (path / 'paper.pdf').unlink()  # the fixture's placeholder scan isn't a real PDF to append
    report = client.get('/api/assignments/1/reports/123456789.pdf')
    assert report.status_code == 200, report.text
    with pymupdf.open('pdf', report.content) as doc:
        assert 'Strong work overall.' in doc[0].get_text()
    # Unmatching the scan keeps a paper whose comment would otherwise be lost.
    with database.get_connection() as conn:
        assert studentpaper_db.prune_ungraded_papers(conn, 1, ['234567890']) == 0
    set_status(database, 'draft')
    assert client.put(url, json={'comment': 'Too early'}).status_code == 409
    set_status(database, 'grading')
    # An empty comment clears it.
    assert client.put(url, json={'comment': '   '}).json() == {'comment': None}
    with database.get_connection() as conn:
        assert conn.execute("SELECT comments FROM studentpaper WHERE exam_id=1 AND uid='123456789'").fetchone()['comments'] is None


def test_exam_question_progress_query_and_route(native):
    client, database, _, _, app = native
    url = '/api/assignments/1/question-progress'
    # Nothing is finished yet: every question counts both enrolled papers.
    start = client.get(url).json()
    assert start['questions'] == [
        {'qid': 'Q1', 'total': 2, 'finished': 0, 'regrade': 0},
        {'qid': 'Q2', 'total': 2, 'finished': 0, 'regrade': 0},
    ]
    assert [(s['name'], s['status'], s['finished']) for s in start['students']] == [
        ('Student', 'not_started', 0), ('Student Two', 'not_started', 0)]
    with database.get_connection() as conn:
        # A paper for a student who is not enrolled must not count, even with a finished mapping.
        conn.execute("INSERT INTO student(uid,name) VALUES ('345678901','Dropped')")
        conn.execute("INSERT INTO studentpaper VALUES (1,'345678901','paper.pdf',NULL)")
        conn.execute("INSERT INTO mapping VALUES (1,'345678901','Q1','alice','Finished')")
        conn.execute("UPDATE mapping SET status='Finished' WHERE uid='123456789' AND qid='Q1'")
        conn.execute("UPDATE mapping SET status='Regrade' WHERE uid='234567890' AND qid='Q1'")
        conn.execute("INSERT INTO mapping VALUES (1,'123456789','Q2','bob','finished')")
        rows = grading_db.exam_question_progress(conn, 1)
    assert rows == [
        {'qid': 'Q1', 'total': 2, 'finished': 1, 'regrade': 1},
        {'qid': 'Q2', 'total': 2, 'finished': 1, 'regrade': 0},
    ]
    body = client.get(url).json()
    assert body['questions'] == rows
    # One row per enrolled student, by name; the dropped student is left out.
    assert body['students'] == [
        {'uid': '123456789', 'name': 'Student', 'questions': 2, 'finished': 2, 'regrade': 0, 'status': 'graded',
         'answers': {'Q1': 'finished', 'Q2': 'finished'}},
        {'uid': '234567890', 'name': 'Student Two', 'questions': 2, 'finished': 0, 'regrade': 1, 'status': 'regrade',
         'answers': {'Q1': 'regrade', 'Q2': 'pending'}},
    ]
    # Course staff only.
    with database.get_connection() as conn:
        conn.execute("INSERT INTO staff VALUES ('carol','Carol',NULL,'ta')")
    app.dependency_overrides[current_user] = lambda: 'carol'
    assert client.get(url).status_code == 403
