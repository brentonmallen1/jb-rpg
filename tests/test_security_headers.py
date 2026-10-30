"""Every response carries the browser-side protections, and the API isn't mapped out for visitors."""

import pytest


def test_responses_lock_the_page_down(client):
    headers = client.get("/api/config").headers
    assert headers["X-Frame-Options"] == "DENY"
    assert "script-src 'self'" in headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert "camera=()" in headers["Permissions-Policy"]


def test_no_api_docs(client):
    from app.main import app

    if app.openapi_url:
        pytest.skip("AUTH_DISABLED (local development) keeps the docs")
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code in (401, 404), path
