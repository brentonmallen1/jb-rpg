"""The storyteller signs in through the app's own page; browsers never get a Basic-auth prompt."""

import pytest


@pytest.fixture
def secured(client, monkeypatch):
    from app import config

    monkeypatch.setattr(config, "ADMIN_USER", "gm")
    monkeypatch.setattr(config, "ADMIN_PASSWORD", "pw")
    return client


def login(client, password="pw"):
    return client.post("/api/admin/login", json={"username": "gm", "password": password})


def test_pages_send_strangers_to_the_sign_in_page(secured):
    resp = secured.get("/editor/abc", follow_redirects=False)
    assert resp.status_code == 303 and resp.headers["location"] == "/login?next=/editor/abc"
    assert secured.get("/", follow_redirects=False).headers["location"] == "/login"


def test_no_browser_prompt(secured):
    resp = secured.get("/api/stories")
    assert resp.status_code == 401 and "www-authenticate" not in resp.headers


def test_signing_in_sets_a_cookie_that_opens_everything(secured):
    assert secured.get("/api/admin/session").json() == {"signed_in": False, "required": True}
    assert login(secured, "wrong").status_code == 401
    resp = login(secured)
    assert resp.status_code == 200
    cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert secured.get("/api/stories").status_code == 200
    assert secured.get("/", follow_redirects=False).status_code != 303
    assert secured.get("/api/admin/session").json()["signed_in"] is True


def test_signing_out(secured):
    login(secured)
    secured.post("/api/admin/logout")
    assert secured.get("/api/stories").status_code == 401


def test_a_signed_out_cookie_never_works_again(secured):
    """Signing out ends the sign-in on the server: a copy of the old cookie is refused too."""
    from app import auth

    login(secured)
    kept = secured.cookies.get(auth.ADMIN_COOKIE)
    assert secured.get("/api/stories").status_code == 200
    secured.post("/api/admin/logout")
    secured.cookies.set(auth.ADMIN_COOKIE, kept)
    assert secured.get("/api/stories").status_code == 401


def test_a_sign_in_lasts_a_week_by_default(secured):
    from app import auth

    resp = login(secured)
    assert f"max-age={7 * 86400}" in resp.headers["set-cookie"].lower()
    assert auth.admin_cookie_ok(auth.admin_cookie_value(now=0)) is False  # long expired


def test_changing_the_password_signs_everyone_out(secured, monkeypatch):
    from app import config

    login(secured)
    monkeypatch.setattr(config, "ADMIN_PASSWORD", "new")
    assert secured.get("/api/stories").status_code == 401


def test_forged_and_expired_cookies_are_refused(secured):
    from app import auth

    secured.cookies.set(auth.ADMIN_COOKIE, "abc.9999999999.deadbeef")
    assert secured.get("/api/stories").status_code == 401
    secured.cookies.set(auth.ADMIN_COOKIE, auth.admin_cookie_value(now=0))  # expired long ago
    assert secured.get("/api/stories").status_code == 401


def test_scripts_can_still_use_basic_auth(secured):
    import base64

    header = {"Authorization": "Basic " + base64.b64encode(b"gm:pw").decode()}
    assert secured.get("/api/stories", headers=header).status_code == 200


def test_too_many_wrong_passwords_lock_that_address_out(secured, monkeypatch):
    import asyncio

    from app import auth

    async def no_wait(_):
        return None
    monkeypatch.setattr(asyncio, "sleep", no_wait)

    for _ in range(auth.FAIL_LIMIT):
        assert login(secured, "wrong").status_code == 401
    resp = login(secured)  # even the right password waits now
    assert resp.status_code == 429 and int(resp.headers["retry-after"]) > 0
    assert "Too many tries" in resp.json()["detail"]

    # After the pause, the right password works and clears the count
    real = auth.time.time
    monkeypatch.setattr(auth.time, "time", lambda: real() + auth.LOCKOUT + 1)
    assert login(secured).status_code == 200


def test_basic_auth_guesses_count_towards_the_same_limit(secured):
    import base64

    from app import auth

    wrong = {"Authorization": "Basic " + base64.b64encode(b"gm:nope").decode()}
    right = {"Authorization": "Basic " + base64.b64encode(b"gm:pw").decode()}
    for _ in range(auth.FAIL_LIMIT):
        assert secured.get("/api/stories", headers=wrong).status_code == 401
    assert secured.get("/api/stories", headers=right).status_code == 401  # locked out
    assert login(secured).status_code == 429


def test_behind_a_proxy_each_client_has_its_own_limit(secured, monkeypatch):
    import base64

    from app import auth, config

    monkeypatch.setattr(config, "TRUST_PROXY", True)
    wrong = {"Authorization": "Basic " + base64.b64encode(b"gm:nope").decode(), "X-Forwarded-For": "spoofed, 203.0.113.9"}
    for _ in range(auth.FAIL_LIMIT):
        secured.get("/api/stories", headers=wrong)
    assert auth.locked_out("203.0.113.9") > 0  # the address the proxy saw, not the spoofable first entry
    assert login(secured).status_code == 200  # the storyteller, elsewhere, is unaffected


def test_a_sign_in_left_unused_ends(secured, monkeypatch):
    from app import auth

    login(secured)
    assert secured.get("/api/stories").status_code == 200
    real = auth.time.time
    monkeypatch.setattr(auth.time, "time", lambda: real() + auth._idle_seconds() + 60)
    assert secured.get("/api/stories").status_code == 401


def test_a_sign_in_in_use_stays_open(secured, monkeypatch):
    from app import auth

    login(secured)
    real = auth.time.time
    for hours in (30, 60, 90):  # used every 30 hours: never idle for 48
        monkeypatch.setattr(auth.time, "time", lambda h=hours: real() + h * 3600)
        assert secured.get("/api/stories").status_code == 200


def test_signing_out_everywhere(secured, client):
    from fastapi.testclient import TestClient

    from app.main import app

    other = TestClient(app)
    login(secured)
    other.post("/api/admin/login", json={"username": "gm", "password": "pw"})
    assert other.get("/api/stories").status_code == 200
    assert secured.post("/api/admin/logout-all").status_code == 200
    assert other.get("/api/stories").status_code == 401
    assert secured.get("/api/stories").status_code == 401
