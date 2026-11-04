import httpx
import pytest

from app import cas

SERVER = "https://cas.example.edu/cas"
SERVICE = "http://testserver/api/auth/callback"

SUCCESS = """<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationSuccess>
    <cas:user> VedPatel </cas:user>
  </cas:authenticationSuccess>
</cas:serviceResponse>"""

FAILURE = """<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationFailure code="INVALID_TICKET">Ticket ST-1 not recognized</cas:authenticationFailure>
</cas:serviceResponse>"""


def test_login_url_encodes_service():
    assert cas.login_url(SERVER, SERVICE) == (
        "https://cas.example.edu/cas/login?service=http%3A%2F%2Ftestserver%2Fapi%2Fauth%2Fcallback"
    )


def test_success_reply_gives_lowercased_directory_id():
    assert cas.parse_service_response(SUCCESS) == "vedpatel"


def test_failure_reply_gives_none():
    assert cas.parse_service_response(FAILURE) is None


@pytest.mark.parametrize("body", ["not xml", "<html><body>Service unavailable</body></html>"])
def test_unreadable_reply_raises(body):
    with pytest.raises(cas.CasError):
        cas.parse_service_response(body)


def test_validate_ticket_asks_cas_about_ticket_and_service():
    def umd_cas(request):
        assert request.url.path == "/cas/serviceValidate"
        assert dict(request.url.params) == {"service": SERVICE, "ticket": "ST-1"}
        return httpx.Response(200, text=SUCCESS)

    assert cas.validate_ticket(SERVER, SERVICE, "ST-1", transport=httpx.MockTransport(umd_cas)) == "vedpatel"


def test_validate_ticket_raises_on_server_error():
    def broken_cas(request):
        return httpx.Response(500)

    with pytest.raises(cas.CasError):
        cas.validate_ticket(SERVER, SERVICE, "ST-1", transport=httpx.MockTransport(broken_cas))


def test_validate_ticket_raises_when_cas_is_unreachable():
    def unreachable_cas(request):
        raise httpx.ConnectTimeout("timed out", request=request)

    with pytest.raises(cas.CasError):
        cas.validate_ticket(SERVER, SERVICE, "ST-1", transport=httpx.MockTransport(unreachable_cas))
