"""Courses and assignments read from and written to PostgreSQL; each test owns an isolated schema."""
import contextlib
import os
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app import assignments, db, store
from app.database import Database
from app.main import create_app
from app.routing.auth import current_user
from app.settings import Settings

real_user_courses = assignments.user_courses  # conftest replaces it with a config.json stand-in


@pytest.fixture
def api(monkeypatch, tmp_path):
    dsn = os.environ.get('GRADEFLOW_TEST_DSN')
    if not dsn:
        pytest.skip('Set GRADEFLOW_TEST_DSN for native PostgreSQL tests')
    schema = 'asg_' + uuid.uuid4().hex[:12]
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    scoped = make_conninfo(dsn, options=f'-c search_path={schema}')
    db.migrate(scoped)
    pool = ConnectionPool(scoped, kwargs={'row_factory': dict_row}, min_size=1, max_size=4, open=True)
    pool.wait()
    monkeypatch.setenv('GRADEFLOW_AUDIT_DIR', str(tmp_path / 'audit'))
    monkeypatch.setattr(assignments, 'user_courses', real_user_courses)
    monkeypatch.setattr(db, 'open_database', lambda url: contextlib.nullcontext(pool))
    monkeypatch.setattr(store, 'DB_PATH', tmp_path / 'db.json')
    database = Database.from_pool(pool)
    with database.get_connection() as conn:
        conn.execute("INSERT INTO staff VALUES ('alice','Alice',NULL,'ta'),('teacher','Teacher',NULL,'instructor')")
        conn.execute("INSERT INTO course(code,term) VALUES ('CMSC250','Fall'),('OTHER','Fall')")
        conn.execute("INSERT INTO course_staff VALUES (1,'alice'),(1,'teacher'),(2,'teacher')")
        conn.execute("""INSERT INTO assignment(course_id,exam_name,due,slug,kind,short) VALUES
            (1,'Quiz 2','2026-10-07','quiz-2','quiz','Q2'),
            (1,'Quiz 1','2026-09-16','quiz-1','quiz',NULL),
            (1,'Notes',NULL,'notes','other',NULL),
            (2,'Hidden','2026-01-01','hidden','exam',NULL)""")
    app = create_app(Settings(_env_file=None, session_secret='asg-test'))
    app.dependency_overrides[current_user] = lambda: 'alice'
    try:
        with TestClient(app) as client:
            yield client, database
    finally:
        database.flush_audit()
        pool.close()
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


def test_courses_list_only_the_users_courses_with_assignments(api):
    client, _ = api
    [course] = client.get('/api/courses').json()
    assert (course['code'], course['instructor'], course['role']) == ('CMSC250', 'Teacher', 'ta')
    # Soonest due first, no due date last; a missing short label falls back to the slug.
    assert [(a['id'], a['short'], a['due']) for a in course['assignments']] == [
        ('quiz-1', 'quiz-1', '2026-09-16'), ('quiz-2', 'Q2', '2026-10-07'), ('notes', 'notes', None)]


def test_course_and_assignment_endpoints_read_the_database(api):
    client, _ = api
    body = client.get('/api/course').json()
    assert body['course']['code'] == 'CMSC250'
    assert [a['id'] for a in body['assignments']] == ['quiz-1', 'quiz-2', 'notes']
    assert body['assignments'][0]['uploads'] == []
    one = client.get('/api/assignments/quiz-2').json()
    assert (one['title'], one['kind'], one['uploads'], one['status']) == ('Quiz 2', 'quiz', [], 'draft')
    assert client.get('/api/assignments/hidden').status_code == 404  # another course's assignment
    assert client.get('/api/assignments/nope/roster').status_code == 404


def test_create_assignment(api):
    client, database = api
    made = client.post('/api/courses/1/assignments', json={'title': 'Final Exam', 'kind': 'final exam', 'due': '2026-12-16'})
    assert made.status_code == 201, made.text
    assert (made.json()['id'], made.json()['kind'], made.json()['short']) == ('final-exam', 'final exam', 'final-exam')
    again = client.post('/api/courses/1/assignments', json={'title': 'Final Exam'}).json()
    assert (again['id'], again['kind']) == ('final-exam-2', 'exam')
    named = client.post('/api/courses/1/assignments', json={'title': 'Lab 1', 'kind': 'lab', 'short': 'L1', 'slug': 'lab-one'}).json()
    assert (named['id'], named['short']) == ('lab-one', 'L1')
    assert client.post('/api/courses/1/assignments', json={'title': 'Dup', 'slug': 'lab-one'}).status_code == 409
    assert client.post('/api/courses/1/assignments', json={'title': 'x', 'kind': 'party'}).status_code == 422
    assert client.post('/api/courses/1/assignments', json={'title': 'x', 'slug': 'Bad Slug'}).status_code == 422
    assert client.post('/api/courses/2/assignments', json={'title': 'x'}).status_code == 403  # not in that course
    assert client.get('/api/assignments/final-exam').json()['due'] == '2026-12-16'
    with database.get_connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM assignment WHERE course_id=1").fetchone()['n'] == 6


def test_edit_assignment(api):
    client, _ = api
    edited = client.patch('/api/assignments/quiz-2', json={'title': 'Quiz Two', 'kind': 'lab', 'due': '2026-11-01'})
    assert edited.status_code == 200, edited.text
    assert (edited.json()['id'], edited.json()['title'], edited.json()['kind'], edited.json()['due'],
            edited.json()['short']) == ('quiz-2', 'Quiz Two', 'lab', '2026-11-01', 'Q2')
    cleared = client.patch('/api/assignments/quiz-2', json={'short': None, 'due': None}).json()
    assert (cleared['short'], cleared['due'], cleared['title']) == ('quiz-2', None, 'Quiz Two')
    assert client.patch('/api/assignments/quiz-2', json={}).json()['title'] == 'Quiz Two'
    assert client.patch('/api/assignments/quiz-2', json={'kind': 'party'}).status_code == 422
    assert client.patch('/api/assignments/quiz-2', json={'title': None}).status_code == 422
    assert client.patch('/api/assignments/hidden', json={'title': 'x'}).status_code == 404
    assert client.get('/api/assignments/quiz-2').json()['title'] == 'Quiz Two'


def test_grading_uses_the_database_assignment_and_never_overwrites_it(api):
    client, database = api
    client.patch('/api/assignments/quiz-1', json={'title': 'Edited title'})
    assert client.get('/api/assignments/quiz-1/queue').status_code == 200  # resolve_exam finds the row
    assert client.get('/api/assignments/nope/queue').status_code == 404
    with database.get_connection() as conn:
        assert conn.execute("SELECT exam_name FROM assignment WHERE slug='quiz-1'").fetchone()['exam_name'] == 'Edited title'


def test_only_an_instructor_in_the_course_adds_a_student(api):
    client, database = api
    student = {'uid': '345678901', 'name': 'New Student'}
    assert client.post('/api/courses/1/roster', json=student).status_code == 403  # alice is a TA
    client.app.dependency_overrides[current_user] = lambda: 'teacher'
    assert client.post('/api/courses/1/roster', json={'uid': '12', 'name': 'x'}).status_code == 422
    assert client.post('/api/courses/3/roster', json=student).status_code == 404  # no such course
    added = client.post('/api/courses/1/roster', json=student)
    assert added.status_code == 201, added.text
    assert added.json()['name'] == 'New Student'
    client.post('/api/courses/1/roster', json={**student, 'name': 'Renamed'})  # same UID again updates the name
    with database.get_connection() as conn:
        assert conn.execute("SELECT name FROM student WHERE uid='345678901'").fetchone()['name'] == 'Renamed'
        assert conn.execute("SELECT count(*) AS n FROM enrollment WHERE uid='345678901' AND course_id=1").fetchone()['n'] == 1


def test_add_multiple_students_at_the_same_time(api):
    client, database = api
    client.app.dependency_overrides[current_user] = lambda: 'teacher'
    students = [
        {'uid': '111222333', 'name': 'Student One', 'email': 'one@umd.edu', 'section': '0101'},
        {'uid': '222333444', 'name': 'Student Two', 'email': 'two@umd.edu', 'section': '0102'},
    ]
    res = client.post('/api/courses/1/roster', json=students)
    assert res.status_code == 201, res.text
    assert len(res.json()) == 2
    with database.get_connection() as conn:
        assert conn.execute("SELECT count(*) AS n FROM enrollment WHERE course_id=1").fetchone()['n'] >= 2


def test_upload_roster_csv(api):
    client, database = api
    csv_content = """UID,Name,Email,Section
118492041,Alex Rivera,arivera@terpmail.umd.edu,0101
119302847,Samantha Chen,schen24@terpmail.umd.edu,0101
"""
    # Alice is a TA -> 403 Forbidden
    res = client.post('/api/courses/1/roster/upload', files={'file': ('roster.csv', csv_content, 'text/csv')})
    assert res.status_code == 403

    # Teacher is instructor -> 201 Created
    client.app.dependency_overrides[current_user] = lambda: 'teacher'
    res = client.post('/api/courses/1/roster/upload', files={'file': ('roster.csv', csv_content, 'text/csv')})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body['uploaded'] == 2
    with database.get_connection() as conn:
        assert conn.execute("SELECT name FROM student WHERE uid='118492041'").fetchone()['name'] == 'Alex Rivera'

    # Invalid UID (< 9 digits) -> 422 Unprocessable
    bad_csv = "UID,Name\n123,Bad UID\n"
    res = client.post('/api/courses/1/roster/upload', files={'file': ('roster.csv', bad_csv, 'text/csv')})
    assert res.status_code == 422


def test_slugs_start_with_a_letter(api):
    client, database = api
    assert client.post('/api/courses/1/assignments', json={'title': '2024'}).json()['id'] == 'assignment-2024'
    assert client.post('/api/courses/1/assignments', json={'title': '!!!'}).json()['id'] == 'assignment'
    assert client.post('/api/courses/1/assignments', json={'title': 'x', 'slug': '2024'}).status_code == 422
    assert client.post('/api/courses/1/assignments', json={'title': 'x', 'slug': '1'}).status_code == 422


def test_add_exam_makes_a_slug(api):
    _, database = api
    first, second = database.add_exam('Midterm 1', 1), database.add_exam('Midterm 1', 1)
    with database.get_connection() as conn:
        slugs = {r['exam_id']: r['slug'] for r in conn.execute('SELECT exam_id, slug FROM assignment')}
    assert (slugs[first], slugs[second]) == ('midterm-1', 'midterm-1-2')
