"""Talks to UMD's CAS server (CAS 2.0 protocol)."""

import logging
from urllib.parse import urlencode
from xml.etree import ElementTree

import httpx

logger = logging.getLogger(__name__)

CAS_NS = "{http://www.yale.edu/tp/cas}"


class CasError(Exception):
    """CAS couldn't be reached, or sent back something we can't read."""


def login_url(server_url: str, service_url: str, renew: bool = False) -> str:
    params = {"service": service_url} | ({"renew": "true"} if renew else {})
    return f"{server_url.rstrip('/')}/login?{urlencode(params)}"


def validate_ticket(
    server_url: str,
    service_url: str,
    ticket: str,
    transport: httpx.BaseTransport | None = None,
    renew: bool = False,
) -> str | None:
    """Directory ID for `ticket`, or None if CAS rejects it (with `renew`, also if no fresh password was entered)."""
    params = {"service": service_url, "ticket": ticket} | ({"renew": "true"} if renew else {})
    try:
        with httpx.Client(timeout=10, transport=transport) as client:
            response = client.get(f"{server_url.rstrip('/')}/serviceValidate", params=params)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise CasError(f"CAS ticket validation request failed: {exc}") from exc
    return parse_service_response(response.text)


def parse_service_response(xml_text: str) -> str | None:
    """Directory ID from a /serviceValidate reply (None if the ticket was rejected)."""
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as exc:
        raise CasError(f"CAS reply isn't valid XML: {exc}") from exc

    user = root.find(f"{CAS_NS}authenticationSuccess/{CAS_NS}user")
    if user is not None and user.text and user.text.strip():
        return user.text.strip().lower()

    failure = root.find(f"{CAS_NS}authenticationFailure")
    if failure is not None:
        logger.warning("CAS rejected the ticket: %s %s", failure.get("code", "no code"), (failure.text or "").strip())
        return None

    raise CasError("CAS reply has neither a user nor a failure")
