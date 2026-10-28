"""The access layers: admin (sign-in cookie, or HTTP Basic for scripts), storyteller token, player session id."""

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Optional

from fastapi import Header, HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse, Response

from . import config, storage
from .models import GameState

log = logging.getLogger("jb_rpg.security")

ADMIN_COOKIE = "jb_admin"
ADMIN_COOKIE_DAYS = 30


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


def ensure_admin_credentials() -> None:
    """Secure by default: with no admin login configured (and auth not explicitly
    disabled), generate one on first run, keep it in the data folder, and log it."""
    if config.AUTH_DISABLED or (config.ADMIN_USER and config.ADMIN_PASSWORD):
        return
    path = storage.STATE_FILE.parent / "admin.json"
    try:
        saved = json.loads(path.read_text())
        user, password = saved["user"], saved["password"]
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        user, password = "admin", secrets.token_urlsafe(12)
        storage.write_json(path, {"user": user, "password": password})
        path.chmod(0o600)
    config.ADMIN_USER, config.ADMIN_PASSWORD = user, password
    log.warning(
        "No ADMIN_USER/ADMIN_PASSWORD set. Storyteller login: %s / %s (saved in %s). "
        "Set ADMIN_USER and ADMIN_PASSWORD to choose your own, or AUTH_DISABLED=true for local play.",
        user, password, path,
    )


def admin_required() -> bool:
    return not config.AUTH_DISABLED and bool(config.ADMIN_USER and config.ADMIN_PASSWORD)


def admin_credentials_ok(username: str, password: str) -> bool:
    return secrets.compare_digest(username, config.ADMIN_USER) and secrets.compare_digest(
        password, config.ADMIN_PASSWORD
    )


def _signing_key() -> bytes:
    """A random secret kept in the data folder, mixed with the login so changing it signs everyone out."""
    path = storage.STATE_FILE.parent / "session.key"
    try:
        secret = path.read_text().strip()
    except FileNotFoundError:
        secret = ""
    if not secret:
        secret = secrets.token_urlsafe(32)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(secret)
        path.chmod(0o600)
    login = f"{config.ADMIN_USER}:{config.ADMIN_PASSWORD}".encode()
    return hmac.new(secret.encode(), login, hashlib.sha256).digest()


def admin_cookie_value(now: float | None = None) -> str:
    """`<expiry>.<signature>`: nothing secret inside, and it can't be forged without the key."""
    expires = int((time.time() if now is None else now) + ADMIN_COOKIE_DAYS * 86400)
    signature = hmac.new(_signing_key(), str(expires).encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{signature}"


def admin_cookie_ok(value: Optional[str]) -> bool:
    try:
        expires, signature = (value or "").split(".", 1)
        if int(expires) < time.time():
            return False
    except ValueError:
        return False
    expected = hmac.new(_signing_key(), expires.encode(), hashlib.sha256).hexdigest()
    return secrets.compare_digest(signature, expected)


def _basic_ok(header: str) -> bool:
    try:
        scheme, encoded = header.split(" ", 1)
        username, password = base64.b64decode(encoded).decode("utf-8").split(":", 1)
    except (ValueError, UnicodeDecodeError):
        return False
    return scheme == "Basic" and admin_credentials_ok(username, password)


def is_admin(request: Request) -> bool:
    """Signed in through the app (cookie), or a script sending HTTP Basic."""
    if not admin_required():
        return True
    return admin_cookie_ok(request.cookies.get(ADMIN_COOKIE)) or _basic_ok(request.headers.get("Authorization", ""))


def verify_admin(request: Request) -> bool:
    if is_admin(request):
        return True
    # No WWW-Authenticate header: the app shows its own sign-in page instead of the browser's prompt
    raise HTTPException(status_code=401, detail="Sign in required")


class AdminPagesMiddleware(BaseHTTPMiddleware):
    """The storyteller's pages send visitors who aren't signed in to /login (the APIs use verify_admin)."""

    PROTECTED_PREFIXES = ("/editor", "/run")

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        protected = path == "/" or path.startswith(self.PROTECTED_PREFIXES)
        if not protected or is_admin(request):
            return await call_next(request)
        return RedirectResponse("/login" + ("" if path == "/" else f"?next={path}"), status_code=303)


# ---------------------------------------------------------------------------
# Storyteller token (hash persisted in state.json, so sessions survive restarts)
# ---------------------------------------------------------------------------


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_token(state: GameState) -> str:
    """Give the session a new storyteller token. Any previous token stops working."""
    token = secrets.token_urlsafe(32)
    state.token_hash = hash_token(token)
    return token


def is_storyteller(state: GameState | None, token: Optional[str]) -> bool:
    return bool(
        state and token and state.token_hash
        and secrets.compare_digest(hash_token(token), state.token_hash)
    )


def verify_storyteller(x_session_token: Optional[str] = Header(None)) -> GameState:
    """Dependency: the active session, if the caller holds its storyteller token."""
    state = storage.load_state()
    if state is None:
        raise HTTPException(status_code=401, detail="No active session")
    if not is_storyteller(state, x_session_token):
        raise HTTPException(status_code=403, detail="Invalid session token")
    return state


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------


def is_player(state: GameState | None, session_id: Optional[str]) -> bool:
    return bool(state and session_id and secrets.compare_digest(session_id, state.session_id))


def player_for_token(state: GameState | None, token: Optional[str]):
    """The named player a phone's token belongs to (turn-taking modes), if any."""
    if not state or not token:
        return None
    hashed = hash_token(token)
    return next((p for p in state.players if secrets.compare_digest(hashed, p.token_hash)), None)
