import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    storage.seed_demo_stories()
    auth.ensure_admin_credentials()
    if config.AUTH_DISABLED:
        log.warning("AUTH_DISABLED is set: anyone who can reach this server can edit stories and run games.")
    # The session in state.json (if any) carries on: its storyteller token is persisted as a hash.
    yield


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app = FastAPI(title="J&B's RPG", lifespan=lifespan)

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
