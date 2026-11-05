"""PostgreSQL: a pool of connections, and the numbered .sql files in migrations/ that build the tables."""

import logging
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

MIGRATIONS = Path(__file__).parent / "migrations"

logger = logging.getLogger(__name__)


def migrate(url: str, folder: Path = MIGRATIONS) -> list[str]:
    """Run the .sql files in `folder` that haven't run yet, in name order, all or nothing."""
    with psycopg.connect(url, row_factory=dict_row) as conn:
        # Serialize migration startup across workers; the caller owns one transaction.
        conn.execute("SELECT pg_advisory_xact_lock(435026)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        done = {row["name"] for row in conn.execute("SELECT name FROM schema_migration")}
        ran = []
        for path in sorted(folder.glob("*.sql")):
            if path.name in done:
                continue
            try:
                conn.execute(path.read_text())
            except psycopg.Error as error:
                error.add_note(f"while running {path}")
                raise
            conn.execute("INSERT INTO schema_migration (name) VALUES (%s)", (path.name,))
            logger.info("Ran migration %s", path.name)
            ran.append(path.name)
    return ran


@contextmanager
def open_database(url: str):
    migrate(url)
    with ConnectionPool(url, kwargs={"row_factory": dict_row}, open=False) as pool:
        yield pool
