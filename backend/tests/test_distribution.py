import shutil

import pytest
from fastapi.testclient import TestClient

from app import rosters, store
from app.main import create_app
from app.processing import TEMPLATE_DIR
from app.routing import distribution


@pytest.fixture(autouse=True)
def no_uploads():
    store.DB_PATH.unlink(missing_ok=True)
    shutil.rmtree(store.UPLOAD_DIR, ignore_errors=True)
    shutil.rmtree(store.SUBMISSION_DIR, ignore_errors=True)


@pytest.mark.parametrize("route", distribution.router.routes, ids=lambda route: route.name)
def test_every_route_needs_sign_in(client, route):
    [method] = route.methods
    path = route.path.format(assignment_id="quiz-1", upload_id="u1", submission_id="s1")
    assert client.request(method, path).status_code == 401


def test_course_comes_from_config(staff_client):
    course = staff_client.get("/api/course").json()
    assert course["course"]["code"] == "CMSC250"
    assert "quiz-1" in [a["id"] for a in course["assignments"]]


def test_upload_split_match_and_assign(staff_client):
    # The blank Quiz 1 cover: a one-page scan holding one exam with empty UID boxes.
    files = {"file": ("scan.pdf", (TEMPLATE_DIR / "quiz-1.pdf").read_bytes(), "application/pdf")}
    assert staff_client.post("/api/assignments/quiz-1/uploads", files=files).status_code == 201
    [upload] = staff_client.get("/api/assignments/quiz-1").json()["uploads"]
    assert upload["status"] == "processed", upload["error"]
    [exam] = upload["submissions"]

    upload_url = f"/api/assignments/quiz-1/uploads/{upload['id']}"
    assert staff_client.post(f"{upload_url}/match").status_code == 202
    [upload] = staff_client.get("/api/assignments/quiz-1").json()["uploads"]
    assert upload["matching"] == "done", upload["matching_error"]
    assert upload["submissions"][0]["match"]["state"] == "needs_review"

    student = rosters.students()[0]
    exam_url = f"{upload_url}/submissions/{exam['id']}"
    assigned = staff_client.post(f"{exam_url}/assign", json={"student_uid": student["uid"]})
    assert assigned.json()["match"]["state"] == "assigned"

    roster = staff_client.get("/api/assignments/quiz-1/roster").json()["students"]
    statuses = {s["uid"]: s["status"] for s in roster}
    assert statuses.pop(student["uid"]) == "submitted"
    assert set(statuses.values()) == {"missing"}


def test_restart_marks_unfinished_uploads_failed(settings):
    store.update(lambda db: db["assignments"][0]["uploads"].append({"id": "u1", "status": "processing"}))
    with TestClient(create_app(settings)):
        pass
    [upload] = store.load()["assignments"][0]["uploads"]
    assert upload["status"] == "failed"
