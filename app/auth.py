"""The access layers: admin (sign-in cookie, or HTTP Basic for scripts), storyteller token, player session id."""

import base64
import hashlib
import hmac
import json
import logging
import secrets
import threading
import time
from typing import Optional

from fastapi import Header, HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse, Response

from . import config, storage
from .models import GameState

log = logging.getLogger("jb_rpg.security")

ADMIN_COOKIE = "jb_admin"


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


def hash_password(password: str, salt: str | None = None) -> str:
    """scrypt, so a copied admin.json doesn't give the password away."""
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex()
    return f"scrypt${salt}${digest}"


def _password_matches(password: str, stored: str) -> bool:
    try:
        _, salt, _digest = stored.split("$", 2)
        return secrets.compare_digest(hash_password(password, salt), stored)
    except ValueError:
        return False


def ensure_admin_credentials() -> None:
    """Secure by default: with no admin login configured (and auth not explicitly disabled),
    generate one on first run, show it once in the log, and keep only its hash in the data folder."""
    if config.AUTH_DISABLED or (config.ADMIN_USER and config.ADMIN_PASSWORD):
        return
    path = storage.STATE_FILE.parent / "admin.json"
    try:
        saved = json.loads(path.read_text())
        user = saved["user"]
        if "password" in saved:  # an older admin.json kept the password itself: keep its hash instead
            saved = {"user": user, "password_hash": hash_password(saved["password"])}
            storage.write_json(path, saved)
        password_hash = saved["password_hash"]
        log.warning(
            "Storyteller login: %s (the password was shown in the log when it was made; delete %s for a new one, "
            "or set ADMIN_USER and ADMIN_PASSWORD).", user, path,
        )
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        user, password = "admin", secrets.token_urlsafe(12)
        password_hash = hash_password(password)
        storage.write_json(path, {"user": user, "password_hash": password_hash})
        log.warning(
            "No ADMIN_USER/ADMIN_PASSWORD set. Storyteller login: %s / %s. It's shown only this once (a hash is "
            "saved in %s). Set ADMIN_USER and ADMIN_PASSWORD to choose your own, or AUTH_DISABLED=true for local play.",
            user, password, path,
        )
    path.chmod(0o600)
    config.ADMIN_USER, config.ADMIN_PASSWORD_HASH = user, password_hash


def admin_required() -> bool:
    return not config.AUTH_DISABLED and bool(config.ADMIN_USER and (config.ADMIN_PASSWORD or config.ADMIN_PASSWORD_HASH))


def admin_credentials_ok(username: str, password: str) -> bool:
    user_ok = secrets.compare_digest(username, config.ADMIN_USER)
    if config.ADMIN_PASSWORD:
        password_ok = secrets.compare_digest(password, config.ADMIN_PASSWORD)
    else:
        password_ok = _password_matches(password, config.ADMIN_PASSWORD_HASH)
    return user_ok and password_ok


# --- Guessing the password: a few tries per address, then a pause -------------------------

FAIL_LIMIT = 5  # failed sign-ins (page or HTTP Basic) from one address...
FAIL_WINDOW = 10 * 60  # ...within this many seconds...
LOCKOUT = 15 * 60  # ...lock that address out for this long
_failures: dict[str, list[float]] = {}
_locked_until: dict[str, float] = {}
_guard = threading.Lock()


def client_ip(request: Request) -> str:
    """The address a request came from. Behind a reverse proxy (TRUST_PROXY), the proxy's
    X-Forwarded-For says who it was for: its last entry is the one the proxy added itself."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if config.TRUST_PROXY and forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def locked_out(ip: str) -> int:
    """Seconds this address must still wait before trying again (0 = it may try)."""
    with _guard:
        left = _locked_until.get(ip, 0) - time.time()
        if left <= 0:
            _locked_until.pop(ip, None)
            return 0
        return int(left) + 1


def record_failure(ip: str) -> None:
    now = time.time()
    with _guard:
        recent = [t for t in _failures.get(ip, []) if t > now - FAIL_WINDOW] + [now]
        _failures[ip] = recent
        if len(recent) >= FAIL_LIMIT:
            _locked_until[ip] = now + LOCKOUT
            _failures.pop(ip, None)
            log.warning("Too many failed storyteller sign-ins from %s: locked out for %d minutes", ip, LOCKOUT // 60)


def record_success(ip: str) -> None:
    with _guard:
        _failures.pop(ip, None)


def reset_guard() -> None:
    with _guard:
        _failures.clear()
        _locked_until.clear()


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
    login = f"{config.ADMIN_USER}:{config.ADMIN_PASSWORD or config.ADMIN_PASSWORD_HASH}".encode()
    return hmac.new(secret.encode(), login, hashlib.sha256).digest()


# --- Sign-ins: recorded on the server, so signing out (or out everywhere) ends them for good ---

SEEN_EVERY = 15 * 60  # note a sign-in as used at most this often (each note is a file write)
_sessions_lock = threading.Lock()


def _sessions_path():
    return storage.STATE_FILE.parent / "admin_sessions.json"


def sign_in_seconds() -> int:
    return int(config.SIGN_IN_DAYS * 86400)


def _idle_seconds() -> int:
    return int(config.SIGN_IN_IDLE_HOURS * 3600)


def _load_sessions(now: float) -> dict[str, dict]:
    """Open sign-ins: id -> {expires, seen}. Expired ones, and ones unused for too long, are dropped."""
    try:
        raw = json.loads(_sessions_path().read_text())
    except (FileNotFoundError, ValueError):
        return {}
    sessions = {}
    for sid, entry in raw.items() if isinstance(raw, dict) else []:
        if not isinstance(entry, dict):
            continue
        expires, seen = entry.get("expires", 0), entry.get("seen", 0)
        if expires > now and seen > now - _idle_seconds():
            sessions[sid] = {"expires": expires, "seen": seen}
    return sessions


def _save_sessions(sessions: dict[str, dict]) -> None:
    path = _sessions_path()
    storage.write_json(path, sessions)
    path.chmod(0o600)


def _sign(sid: str, expires: str) -> str:
    return hmac.new(_signing_key(), f"{sid}.{expires}".encode(), hashlib.sha256).hexdigest()


def admin_cookie_value(now: float | None = None) -> str:
    """A new sign-in: `<id>.<expiry>.<signature>`. The id is recorded on the server until it
    expires, goes unused too long, or the storyteller signs out; the signature means it can't be forged."""
    now = time.time() if now is None else now
    sid = secrets.token_urlsafe(16)
    expires = int(now + sign_in_seconds())
    with _sessions_lock:
        sessions = _load_sessions(time.time())
        sessions[sid] = {"expires": expires, "seen": now}
        _save_sessions(sessions)
    return f"{sid}.{expires}.{_sign(sid, str(expires))}"


def _parse_cookie(value: Optional[str]) -> tuple[str, str] | None:
    try:
        sid, expires, signature = (value or "").split(".", 2)
        int(expires)
    except ValueError:
        return None
    if not secrets.compare_digest(signature, _sign(sid, expires)):
        return None
    return sid, expires


def admin_cookie_ok(value: Optional[str]) -> bool:
    parsed = _parse_cookie(value)
    if parsed is None:
        return False
    sid, expires = parsed
    now = time.time()
    if int(expires) <= now:
        return False
    with _sessions_lock:
        sessions = _load_sessions(now)
        entry = sessions.get(sid)
        if entry is None:
            return False
        if now - entry["seen"] > SEEN_EVERY:  # still in use: keep it from going idle
            entry["seen"] = now
            _save_sessions(sessions)
    return True


def end_admin_session(value: Optional[str]) -> None:
    """Sign out: forget this sign-in on the server, so its cookie never works again."""
    parsed = _parse_cookie(value)
    with _sessions_lock:
        sessions = _load_sessions(time.time())
        if parsed and sessions.pop(parsed[0], None) is not None:
            _save_sessions(sessions)


def end_all_admin_sessions() -> None:
    """Sign out everywhere: every browser that's signed in has to sign in again."""
    with _sessions_lock:
        _save_sessions({})


def _basic_ok(header: str) -> bool:
    try:
        scheme, encoded = header.split(" ", 1)
        username, password = base64.b64decode(encoded).decode("utf-8").split(":", 1)
    except (ValueError, UnicodeDecodeError):
        return False
    return scheme == "Basic" and admin_credentials_ok(username, password)


def is_admin(request: Request) -> bool:
    """Signed in through the app (cookie), or a script sending HTTP Basic (which counts towards
    the same limit on wrong passwords as the sign-in page)."""
    if not admin_required():
        return True
    if admin_cookie_ok(request.cookies.get(ADMIN_COOKIE)):
        return True
    header = request.headers.get("Authorization", "")
    if not header:
        return False
    ip = client_ip(request)
    if locked_out(ip):
        return False
    if _basic_ok(header):
        record_success(ip)
        return True
    record_failure(ip)
    return False


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
