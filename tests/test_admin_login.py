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


def test_changing_the_password_signs_everyone_out(secured, monkeypatch):
    from app import config

    login(secured)
    monkeypatch.setattr(config, "ADMIN_PASSWORD", "new")
    assert secured.get("/api/stories").status_code == 401


def test_forged_and_expired_cookies_are_refused(secured):
    from app import auth

    secured.cookies.set(auth.ADMIN_COOKIE, "9999999999.deadbeef")
    assert secured.get("/api/stories").status_code == 401
    secured.cookies.set(auth.ADMIN_COOKIE, auth.admin_cookie_value(now=0))  # expired long ago
    assert secured.get("/api/stories").status_code == 401


def test_scripts_can_still_use_basic_auth(secured):
    import base64

    header = {"Authorization": "Basic " + base64.b64encode(b"gm:pw").decode()}
    assert secured.get("/api/stories", headers=header).status_code == 200
