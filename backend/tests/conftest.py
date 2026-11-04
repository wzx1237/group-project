import contextlib
import os
import shutil
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Must be set before the app is imported.
_data_dir = tempfile.TemporaryDirectory(prefix="gradeflow-test-")
shutil.copytree(
    Path(__file__).resolve().parents[2] / "data",
    _data_dir.name,
    dirs_exist_ok=True,
    ignore=shutil.ignore_patterns("db.json", "uploads", "submissions"),
)
os.environ["GRADEFLOW_DATA_DIR"] = _data_dir.name

from app import cas, db, rosters
from app.main import create_app
from app.routing import auth
from app.settings import Settings


@pytest.fixture(autouse=True)
def no_database(monkeypatch):
    monkeypatch.setattr(db, "open_database", lambda url: contextlib.nullcontext())
    monkeypatch.setattr(rosters, "students", lambda pool=None: rosters.students_csv())


@pytest.fixture
def settings():
    return Settings(
        _env_file=None,
        app_base_url="http://testserver",
        session_secret="test-secret",
    )


@pytest.fixture
def staff():
    return {"vedpatel", "zwang189"}


@pytest.fixture
def client(settings, staff, monkeypatch):
    monkeypatch.setattr(auth, "is_staff", lambda request, directory_id: directory_id in staff)
    app = create_app(settings)
    app.state.db = None
    return TestClient(app, follow_redirects=False)


@pytest.fixture
def staff_client(client, monkeypatch):
    """`client`, signed in as a staff member."""
    monkeypatch.setattr(cas, "validate_ticket", lambda server, service, ticket, **kwargs: "vedpatel")
    client.get("/api/auth/login")
    client.get("/api/auth/callback", params={"ticket": "ST-1"})
    return client
