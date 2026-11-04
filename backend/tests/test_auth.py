from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient

from app import cas
from app.routing.auth import safe_next

UMD_CAS = "https://shib.idm.umd.edu/shibboleth-idp/profile/cas"


def sign_in(client, monkeypatch, directory_id="vedpatel", next_path="/"):
    """Sign in as `directory_id`, with CAS stubbed out."""
    monkeypatch.setattr(cas, "validate_ticket", lambda server, service, ticket, **kwargs: directory_id)
    client.get("/api/auth/login", params={"next": next_path})
    return client.get("/api/auth/callback", params={"ticket": "ST-1"})


def test_login_redirects_to_umd_cas(client):
    response = client.get("/api/auth/login")
    location = urlsplit(response.headers["location"])
    assert response.status_code == 303
    assert f"{location.scheme}://{location.netloc}{location.path}" == f"{UMD_CAS}/login"
    assert parse_qs(location.query) == {"service": ["http://testserver/api/auth/callback"]}


def test_staff_member_signs_in(client, monkeypatch):
    response = sign_in(client, monkeypatch, next_path="/courses")
    assert response.status_code == 303
    assert response.headers["location"] == "/courses"
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert f"max-age={12 * 3600}" in cookie
    assert client.get("/api/auth/me").json() == {"directory_id": "vedpatel"}


def test_staff_list_ignores_case(client, monkeypatch):
    sign_in(client, monkeypatch, directory_id="zwang189")
    assert client.get("/api/auth/me").json() == {"directory_id": "zwang189"}


def test_someone_not_on_staff_list_is_refused(client, monkeypatch):
    response = sign_in(client, monkeypatch, directory_id="terpstudent")
    assert response.headers["location"] == "/login?error=not_authorized"
    assert client.get("/api/auth/me").status_code == 401


def test_ticket_rejected_by_cas(client, monkeypatch):
    response = sign_in(client, monkeypatch, directory_id=None)
    assert response.headers["location"] == "/login?error=login_failed"
    assert client.get("/api/auth/me").status_code == 401


def test_ticket_without_starting_sign_in_is_refused(client, monkeypatch):
    monkeypatch.setattr(cas, "validate_ticket", lambda *args: pytest.fail("CAS should not be asked"))
    assert client.get("/api/auth/callback", params={"ticket": "ST-1"}).status_code == 200  # the bounce page
    response = client.get("/api/auth/callback", params={"ticket": "ST-1", "bounced": 1})
    assert response.headers["location"] == "/login?error=login_failed"
    assert client.get("/api/auth/me").status_code == 401


def test_callback_without_our_cookie_retries_from_our_own_page(client, monkeypatch):
    monkeypatch.setattr(cas, "validate_ticket", lambda server, service, ticket, **kwargs: "vedpatel")
    client.get("/api/auth/login")
    bounce = TestClient(client.app, follow_redirects=False).get("/api/auth/callback", params={"ticket": "ST-1"})
    assert bounce.status_code == 200
    assert "set-cookie" not in bounce.headers
    assert 'url=/api/auth/callback?ticket=ST-1&amp;bounced=1"' in bounce.text
    response = client.get("/api/auth/callback", params={"ticket": "ST-1", "bounced": 1})
    assert response.headers["location"] == "/"
    assert client.get("/api/auth/me").json() == {"directory_id": "vedpatel"}


def test_cas_unreachable(client, monkeypatch):
    def unreachable(*args, **kwargs):
        raise cas.CasError("connection refused")

    monkeypatch.setattr(cas, "validate_ticket", unreachable)
    client.get("/api/auth/login")
    response = client.get("/api/auth/callback", params={"ticket": "ST-1"})
    assert response.headers["location"] == "/login?error=cas_unavailable"


def test_sign_out_returns_to_our_login_page(client, monkeypatch):
    sign_in(client, monkeypatch)
    response = client.post("/api/auth/logout")
    assert response.headers["location"] == "/login?signed_out=1"
    assert client.get("/api/auth/me").status_code == 401


def test_removal_from_staff_list_ends_access(client, staff, monkeypatch):
    sign_in(client, monkeypatch)
    staff.remove("vedpatel")
    assert client.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize(
    "value, expected",
    [
        ("/courses/1?tab=rubric", "/courses/1?tab=rubric"),
        (None, "/"),
        ("", "/"),
        ("courses", "/"),
        ("https://evil.example", "/"),
        ("//evil.example", "/"),
        ("/\\evil.example", "/"),
        ("/\t/evil.example", "/"),
    ],
)
def test_safe_next_only_allows_local_paths(value, expected):
    assert safe_next(value) == expected
