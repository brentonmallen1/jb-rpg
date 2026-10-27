"""The three access layers: admin (HTTP Basic), storyteller token, player session id."""

import base64
import hashlib
import json
import logging
import secrets
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from . import config, storage
from .models import GameState

log = logging.getLogger("jb_rpg.security")

basic = HTTPBasic(auto_error=False)
BASIC_CHALLENGE = {"WWW-Authenticate": "Basic realm='Admin'"}


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


def is_admin(credentials: Optional[HTTPBasicCredentials]) -> bool:
    if not admin_required():
        return True
    return credentials is not None and admin_credentials_ok(credentials.username, credentials.password)


def verify_admin(credentials: Optional[HTTPBasicCredentials] = Depends(basic)) -> bool:
    if is_admin(credentials):
        return True
    if credentials:
        log.warning("Admin auth failed for user %r", credentials.username)
    raise HTTPException(status_code=401, detail="Authentication required", headers=BASIC_CHALLENGE)


class AdminPagesMiddleware(BaseHTTPMiddleware):
    """Basic auth for the storyteller's pages (the APIs use verify_admin)."""

    PROTECTED_PREFIXES = ("/editor", "/run")

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        protected = path == "/" or path.startswith(self.PROTECTED_PREFIXES)
        if not protected or not admin_required():
            return await call_next(request)

        header = request.headers.get("Authorization", "")
        try:
            scheme, encoded = header.split(" ", 1)
            username, password = base64.b64decode(encoded).decode("utf-8").split(":", 1)
            if scheme == "Basic" and admin_credentials_ok(username, password):
                return await call_next(request)
        except ValueError:
            pass
        return Response("Authentication required", status_code=401, headers=BASIC_CHALLENGE)


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
