"""Sign-in through UMD CAS, sign-out, and the `current_user` dependency."""

import html
import logging
import time
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import cas
from app.settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth")

# Activity re-issues the session cookie at most this often, which restarts its idle timer.
REFRESH_SECONDS = 5 * 60

BOUNCE_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url={url}">
  <title>Signing in · GradeFlow</title>
</head>
<body>
  <p>Signing you in… If nothing happens, <a href="{url}">continue</a>.</p>
</body>
</html>
"""


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings)]


def safe_next(path: str | None) -> str:
    """`path` if it's a page on this site, otherwise "/"."""
    if (
        not path
        or not path.startswith("/")
        or path.startswith("//")
        or "\\" in path
        or any(ord(ch) <= 32 or ord(ch) == 127 for ch in path)
    ):
        return "/"
    return path


def is_staff(request: Request, directory_id: str) -> bool:
    with request.app.state.db.connection() as conn:
        return conn.execute("SELECT 1 FROM staff WHERE directory_id = %s", (directory_id,)).fetchone() is not None


def signed_in_user(request: Request) -> str | None:
    """Directory ID of the signed-in staff member, or None. Keeps an active session alive."""
    session = request.session
    directory_id = session.get("directory_id")
    if directory_id is None:
        return None
    settings = get_settings(request)
    now = int(time.time())
    if now - session.get("signed_in_at", 0) > settings.session_max_days * 86400 or not is_staff(request, directory_id):
        session.clear()
        return None
    if now - session.get("seen", 0) > REFRESH_SECONDS:
        session["seen"] = now
    return directory_id


def current_user(request: Request) -> str:
    """Dependency for API routes that only signed-in staff may use."""
    directory_id = signed_in_user(request)
    if directory_id is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return directory_id


@router.get("/login")
def login(request: Request, settings: SettingsDep, next_path: Annotated[str, Query(alias="next")] = "/"):
    if signed_in_user(request):
        return RedirectResponse(safe_next(next_path), status_code=303)
    # After a deliberate sign-out, UMD must ask for the password again.
    renew = bool(request.session.get("signed_out") or request.session.get("renew"))
    request.session.clear()
    request.session["next"] = safe_next(next_path)
    if renew:
        request.session["renew"] = True
    url = cas.login_url(settings.cas_server_url, settings.cas_service_url, renew=renew)
    return RedirectResponse(url, status_code=303)


@router.get("/callback")
def callback(request: Request, settings: SettingsDep, ticket: str = "", bounced: bool = False):
    if not ticket:
        logger.warning("Sign-in refused: CAS sent no ticket")
        return RedirectResponse("/login?error=login_failed", status_code=303)
    if "next" not in request.session and not bounced:
        logger.info("Callback arrived without our cookie; retrying from our own page")
        url = "/api/auth/callback?" + urlencode({"ticket": ticket, "bounced": 1})
        return HTMLResponse(BOUNCE_PAGE.format(url=html.escape(url)))

    next_path = request.session.pop("next", None)
    if next_path is None:
        logger.warning("Sign-in refused: no sign-in was started from this browser at this address")
        return RedirectResponse("/login?error=login_failed", status_code=303)

    renew = request.session.get("renew", False)
    try:
        directory_id = cas.validate_ticket(settings.cas_server_url, settings.cas_service_url, ticket, renew=renew)
    except cas.CasError:
        logger.exception("Couldn't validate the ticket with CAS")
        return RedirectResponse("/login?error=cas_unavailable", status_code=303)
    if directory_id is None:
        return RedirectResponse("/login?error=login_failed", status_code=303)
    if not is_staff(request, directory_id):
        logger.warning("Sign-in refused for %s: not on the staff list", directory_id)
        return RedirectResponse("/login?error=not_authorized", status_code=303)

    request.session.clear()
    now = int(time.time())
    request.session.update(directory_id=directory_id, signed_in_at=now, seen=now)
    logger.info("Signed in: %s", directory_id)
    return RedirectResponse(next_path, status_code=303)


@router.post("/logout")
def logout(request: Request):
    if directory_id := request.session.get("directory_id"):
        logger.info("Signed out: %s", directory_id)
    request.session.clear()
    request.session["signed_out"] = True
    return RedirectResponse("/login?signed_out=1", status_code=303)


@router.get("/me")
def me(directory_id: Annotated[str, Depends(current_user)]):
    return {"directory_id": directory_id}
