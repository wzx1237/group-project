"""The seeder loads assignments from config.json once and never overwrites them afterwards."""
import os
import uuid

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from app import config, seed


@pytest.fixture
def url():
    dsn = os.environ.get('GRADEFLOW_TEST_DSN')
    if not dsn:
        pytest.skip('Set GRADEFLOW_TEST_DSN for native PostgreSQL tests')
    schema = 'seed_' + uuid.uuid4().hex[:12]
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    try:
        yield make_conninfo(dsn, options=f'-c search_path={schema}')
    finally:
        with psycopg.connect(dsn, autocommit=True) as conn:
            conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


def rows(url):
    with psycopg.connect(url) as conn:
        return {r[0]: r[1:] for r in conn.execute(
            'SELECT slug, exam_name, due, kind, short FROM assignment ORDER BY exam_id')}


def test_seed_loads_assignments_once_and_keeps_edits(url):
    expected = config.load()['assignments']
    assert len(expected) == 13

    seed.seed(url)
    first = rows(url)
    assert len(first) == 13
    for a in expected:
        _, _, kind, short = first[a['id']]
        assert (kind, short) == (a['kind'], a['short'])
    assert first['final'][2] == 'final exam'

    with psycopg.connect(url) as conn:
        conn.execute("UPDATE assignment SET exam_name='Edited', kind='lab' WHERE slug='quiz-1'")

    seed.seed(url)
    second = rows(url)
    assert len(second) == 13
    assert second['quiz-1'][0] == 'Edited' and second['quiz-1'][2] == 'lab'
    assert {k: v for k, v in second.items() if k != 'quiz-1'} == {k: v for k, v in first.items() if k != 'quiz-1'}
