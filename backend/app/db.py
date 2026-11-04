"""PostgreSQL: a pool of connections, and the numbered .sql files in migrations/ that build the tables."""

import logging
import re
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
        conn.execute("SELECT pg_advisory_xact_lock(435026)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        # Serialize bootstrap across app workers. schemas.sql is an alternative
        # fresh v2 schema, not a migration after the two historical v1 files.
        exists = conn.execute("SELECT to_regclass('staff') AS name").fetchone()["name"]
        if exists is None:
            schema = (folder / "schemas.sql").read_text()
            schema = re.sub(r"(?m)^(BEGIN|COMMIT);\s*$", "", schema)
            conn.execute(schema)
            conn.execute("INSERT INTO schema_migration (name) VALUES ('schemas.sql')")
        elif conn.execute("SELECT to_regclass('audit_outbox') AS name").fetchone()["name"] is None:
            raise RuntimeError("Existing legacy database requires an explicit backed-up v2 migration; "
                               "schemas.sql is only for an empty database. No data was changed.")
        done = {row["name"] for row in conn.execute("SELECT name FROM schema_migration")}
        ran = []
        for path in sorted(folder.glob("*.sql")):
            if path.name in done or path.name in {"schemas.sql", "001_staff_and_courses.sql", "002_students.sql"}:
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
