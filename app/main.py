import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from . import auth, config, storage
from .engine import GameError
from .routes import admin, pages, session, stories
from .storage import InvalidStoryId

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("jb_rpg")

_SECRETS_IN_PATHS = re.compile(r"(/player/)[^/?\s\"]+|([?&](?:s|token|p|d)=)[^&\s\"]+")


class RedactAccessLog(logging.Filter):
    """Player links and session/storyteller/player tokens are keys to the game: keep them out of access logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(
                _SECRETS_IN_PATHS.sub(lambda m: (m.group(1) or m.group(2)) + "…", a) if isinstance(a, str) else a
                for a in record.args
            )
        return True


logging.getLogger("uvicorn.access").addFilter(RedactAccessLog())


@asynccontextmanager
async def lifespan(app: FastAPI):
    storage.seed_demo_stories()
    auth.ensure_admin_credentials()
    if config.AUTH_DISABLED:
        log.warning("AUTH_DISABLED is set: anyone who can reach this server can edit stories and run games.")
    # The session in state.json (if any) carries on: its storyteller token is persisted as a hash.
    yield


# Only this server's own scripts run; images, fonts and sound come from here (or are drawn as data:/blob:
# URLs: crests, the keepsake image, uploaded audio). Inline styles are React's style props.
CONTENT_SECURITY_POLICY = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "connect-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])

# Nothing here needs these (the wake lock and the clipboard stay allowed)
PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
        response.headers["Permissions-Policy"] = PERMISSIONS_POLICY
        return response


_AUDIO_UPLOAD = re.compile(r"^/api/stories/[^/]+/audio/")  # MAX_AUDIO_BYTES in routes/stories.py


class BodyLimitMiddleware:
    """Refuses a request body over MAX_STORY_MB before anything parses it: by its Content-Length,
    or as it arrives when it doesn't say."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or _AUDIO_UPLOAD.match(scope["path"]):
            return await self.app(scope, receive, send)
        limit = int(config.MAX_STORY_MB * 1024 * 1024)
        length = dict(scope["headers"]).get(b"content-length", b"")
        if length.isdigit() and int(length) > limit:
            return await self.too_large(scope, receive, send)
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise HTTPException(status_code=413, detail=self.message())
            return message

        await self.app(scope, limited_receive, send)

    @staticmethod
    def message() -> str:
        return f"That's more than the server takes ({config.MAX_STORY_MB:g} MB)"

    async def too_large(self, scope, receive, send):
        await JSONResponse(status_code=413, content={"detail": self.message()})(scope, receive, send)


# The interactive API docs are a map of every endpoint: only for local development
_docs = {} if config.AUTH_DISABLED else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title="J&B's RPG", lifespan=lifespan, **_docs)

app.add_middleware(BodyLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Session-Token", "Authorization"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(auth.AdminPagesMiddleware)


@app.exception_handler(GameError)
async def game_error(request: Request, exc: GameError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(InvalidStoryId)
async def invalid_story_id(request: Request, exc: InvalidStoryId):
    return JSONResponse(status_code=400, content={"detail": "Invalid story ID format"})


@app.get("/api/config")
async def get_config():
    """Public configuration for the frontend."""
    return {"base_url": config.BASE_URL or None}


app.include_router(admin.router)
app.include_router(stories.router)
app.include_router(session.router)
app.include_router(pages.router)

# Built frontend: hashed bundles under /assets, plus root files like favicon.svg
if (config.STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=config.STATIC_DIR / "assets"), name="assets")
if config.STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=config.STATIC_DIR), name="static-root")
