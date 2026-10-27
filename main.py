import asyncio
import json
import logging
import os
import random
import re
import string
import uuid
from collections import defaultdict
from time import time

import secrets

import base64

from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, HTMLResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse
from contextlib import asynccontextmanager
from pathlib import Path
from enum import Enum
from typing import Optional, Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Security: Logging
# ---------------------------------------------------------------------------

security_logger = logging.getLogger("security")
security_logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
security_logger.addHandler(_handler)

# ---------------------------------------------------------------------------
# Security: Rate Limiting
# ---------------------------------------------------------------------------

_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 30  # requests per window


def check_rate_limit(client_ip: str) -> bool:
    """Return True if within rate limit, False if exceeded."""
    now = time()
    _rate_limit_store[client_ip] = [
        t for t in _rate_limit_store[client_ip] if now - t < RATE_LIMIT_WINDOW
    ]
    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        return False
    _rate_limit_store[client_ip].append(now)
    return True


def rate_limit_dependency(request: Request):
    """FastAPI dependency to enforce rate limiting on state mutation endpoints."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        security_logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        raise HTTPException(status_code=429, detail="Too many requests")


class ThemeName(str, Enum):
    CYBERPUNK = "cyberpunk"
    FANTASY = "fantasy"
    DEEP_SPACE = "deep_space"
    MODERN = "modern"
    HORROR = "horror"
    INSANITY = "insanity"


class SessionStatus(str, Enum):
    MADLIB_IN_PROGRESS = "madlib_in_progress"
    CHARACTER_REVEAL = "character_reveal"  # Storyteller reads character to players
    OPENING_SCENE_ACTIVE = "opening_scene_active"
    RUNNING = "running"
    AWAITING_SCENE_SELECTION = "awaiting_scene_selection"
    GAME_OVER = "game_over"


class ChoiceKind(str, Enum):
    DAMAGE = "damage"
    ITEM = "item"
    LEVEL = "level"


class ConditionType(str, Enum):
    HP = "hp"
    ITEMS = "items"
    LEVEL = "level"
    SCENE_OUTCOME = "scene_outcome"


class Condition(BaseModel):
    type: ConditionType
    op: Optional[Literal["lte", "gte", "eq"]] = None
    value: Optional[int] = None
    scene_id: Optional[str] = None
    outcome: Optional[Literal["damage", "item", "level"]] = None


class ConditionalText(BaseModel):
    condition: Condition
    text: str


class OpeningChoice(BaseModel):
    text: str
    target_scene_id: Optional[str] = None  # None = go to scene selection


class OpeningScene(BaseModel):
    title: str
    base_text: str
    choices: list[OpeningChoice] = []
    conditional_text: list[ConditionalText] = []


class Choice(BaseModel):
    kind: ChoiceKind
    display_text: str  # What players see when choosing (e.g., "Do you choose to...")
    result_text: str   # What storyteller reads after choice is made
    amount: int = 1
    item_name: Optional[str] = None


class Scene(BaseModel):
    id: str
    title: str
    display_name: Optional[str] = None  # Poetic/descriptive name for scene selection
    base_text: str
    choices: list[Choice] = []  # Empty for finale scenes
    conditional_text: list[ConditionalText] = []
    is_finale: bool = False  # If true, this is the final die-roll scene
    finale_setup_text: Optional[str] = None  # Read before die roll
    victory_text: Optional[str] = None  # Read on victory
    defeat_text: Optional[str] = None  # Read on defeat
    # Item-conditional text blocks for finale: { "ItemName": { "victory": "...", "defeat": "..." } }
    item_texts: dict[str, dict[str, str]] = {}


class MadLibField(BaseModel):
    key: str
    label: str
    hint: Optional[str] = None  # Grammar hint (e.g., "verb, past tense")


class MadLibTemplate(BaseModel):
    prompt: str
    fields: list[MadLibField]


class StorySettings(BaseModel):
    starting_hp: int = 3
    non_linear: bool = False


class Story(BaseModel):
    id: str
    title: str
    theme: ThemeName = ThemeName.CYBERPUNK
    settings: StorySettings = StorySettings()
    madlib_template: MadLibTemplate
    scenes: list[Scene]
    opening_scene: Optional[OpeningScene] = None


class HistoryEntry(BaseModel):
    scene_id: str
    outcome: ChoiceKind
    choice_index: int
    item_name: Optional[str] = None
    damage_amount: int = 1


class Character(BaseModel):
    name: str
    description: str
    fields: dict[str, str]


class GameState(BaseModel):
    session_id: str = ""  # Nanoid-style identifier for player URLs
    story_id: str
    status: SessionStatus = SessionStatus.MADLIB_IN_PROGRESS
    madlib_step: int = 0
    madlib_answers: dict[str, str] = {}
    current_scene_id: str
    hp: int
    level: int = 1
    items: list[str] = []
    history: list[HistoryEntry] = []
    character: Optional[Character] = None
    outcome: Optional[Literal["victory", "defeat"]] = None
    outcome_revealed: bool = False
    choices_revealed: bool = False
    shuffled_indices: list[int] = []


def inject_variables(
    text: str,
    fields: dict[str, str] | None,
    state: "GameState | None" = None,
    item_texts: dict[str, dict[str, str]] | None = None,
    outcome: Literal["victory", "defeat"] | None = None,
) -> str:
    """Replace {key} placeholders with values from fields dict and item_text references."""

    def replace(match):
        key = match.group(1)

        # Check for item_text:ItemName syntax
        if key.startswith("item_text:"):
            item_name = key[10:]  # strip "item_text:" prefix
            if state and item_name in state.items and item_texts and item_name in item_texts:
                item_entry = item_texts[item_name]
                # Get text for the specific outcome, or empty if not defined
                if outcome and outcome in item_entry:
                    return item_entry[outcome]
                # Fall back to victory text if defeat not defined, or vice versa
                return item_entry.get("victory", item_entry.get("defeat", ""))
            return ""  # remove placeholder if item not collected

        # Fall back to mad lib fields
        if fields:
            return fields.get(key, match.group(0))
        return match.group(0)

    # Regex allows word chars, spaces, colons, hyphens, underscores, apostrophes for item names
    return re.sub(r"\{([\w\s:_'\-]+)\}", replace, text)


def evaluate_condition(condition: Condition, state: GameState) -> bool:
    """Evaluate a condition against current game state."""
    if condition.type == ConditionType.SCENE_OUTCOME:
        for entry in state.history:
            if entry.scene_id == condition.scene_id:
                return entry.outcome.value == condition.outcome
        return False

    if condition.type == ConditionType.HP:
        actual = state.hp
    elif condition.type == ConditionType.ITEMS:
        actual = len(state.items)
    elif condition.type == ConditionType.LEVEL:
        actual = state.level
    else:
        return False

    # Validate that op and value are present for numeric conditions
    if not condition.op or condition.value is None:
        return False

    if condition.op == "lte":
        return actual <= condition.value
    elif condition.op == "gte":
        return actual >= condition.value
    elif condition.op == "eq":
        return actual == condition.value
    return False


def resolve_scene_text(scene: Scene, state: GameState) -> str:
    """Build full scene text with conditionals and variable injection."""
    fields = state.character.fields if state.character else None
    text = inject_variables(scene.base_text, fields)
    for ct in scene.conditional_text:
        if evaluate_condition(ct.condition, state):
            injected = inject_variables(ct.text, fields)
            text += " " + injected
    return text


def replay_history(
    history: list[HistoryEntry], starting_hp: int
) -> tuple[int, int, list[str]]:
    """Replay history to calculate hp, level, items from scratch."""
    hp = starting_hp
    level = 1
    items = []
    for entry in history:
        if entry.outcome == ChoiceKind.DAMAGE:
            hp -= entry.damage_amount
        elif entry.outcome == ChoiceKind.ITEM:
            if entry.item_name:
                items.append(entry.item_name)
        elif entry.outcome == ChoiceKind.LEVEL:
            level += 1
    return hp, level, items


DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).parent))
STATIC_DIR = Path(__file__).parent / "static"
STORIES_DIR = DATA_DIR / "stories"
STATE_FILE = DATA_DIR / "state.json"


@asynccontextmanager
async def lifespan(app):
    # Clear any orphaned session on startup - prevents stale sessions from
    # persisting after app restarts (storyteller token is lost but state.json remains)
    if STATE_FILE.exists():
        with open(STATE_FILE, "w") as f:
            f.write("{}")
    yield


app = FastAPI(title="J&B's RPG", lifespan=lifespan)

# Parse allowed origins from env (comma-separated)
_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8008")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Session-Token", "Authorization"],
)

# Admin authentication configuration
ADMIN_USER = os.getenv("ADMIN_USER", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
AUTH_DISABLED = os.getenv("AUTH_DISABLED", "").lower() in ("true", "1", "yes")
BASE_URL = os.getenv("BASE_URL", "")

# Ensure directories exist
STORIES_DIR.mkdir(parents=True, exist_ok=True)

# Session token for storyteller authentication (in-memory, resets on server restart)
_session_token: Optional[str] = None

# HTTP Basic Auth security
security = HTTPBasic(auto_error=False)


def get_session_token():
    """Return current session token."""
    return _session_token


def verify_storyteller(x_session_token: Optional[str] = Header(None)):
    """Dependency to verify storyteller has valid session token."""
    global _session_token
    if _session_token is None:
        raise HTTPException(status_code=401, detail="No active session")
    if not secrets.compare_digest(x_session_token or "", _session_token or ""):
        raise HTTPException(status_code=403, detail="Invalid session token")
    return True


def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    """Dependency to verify admin credentials via HTTP Basic Auth."""
    if AUTH_DISABLED:
        return True
    if not ADMIN_USER or not ADMIN_PASSWORD:
        # No admin credentials configured - allow access
        return True
    if not credentials:
        security_logger.warning("Admin auth failed: no credentials provided")
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Basic realm='Admin'"},
        )
    if secrets.compare_digest(credentials.username, ADMIN_USER) and secrets.compare_digest(
        credentials.password, ADMIN_PASSWORD
    ):
        return True
    security_logger.warning(f"Admin auth failed: invalid credentials for user '{credentials.username}'")
    raise HTTPException(
        status_code=401,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Basic realm='Admin'"},
    )


class AdminAuthMiddleware(BaseHTTPMiddleware):
    """Middleware to protect static admin routes with HTTP Basic Auth."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Protected paths (admin-only static routes)
        protected_prefixes = ["/editor", "/run"]
        protected_exact = ["/"]

        is_protected = path in protected_exact or any(
            path.startswith(p) for p in protected_prefixes
        )

        if not is_protected:
            return await call_next(request)

        # Skip auth if disabled or not configured
        if AUTH_DISABLED or not ADMIN_USER or not ADMIN_PASSWORD:
            return await call_next(request)

        # Check Basic Auth header
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Basic "):
            return StarletteResponse(
                status_code=401,
                headers={"WWW-Authenticate": "Basic realm='Admin'"},
                content="Authentication required",
            )

        try:
            encoded = auth_header[6:]  # Strip "Basic "
            decoded = base64.b64decode(encoded).decode("utf-8")
            username, password = decoded.split(":", 1)
        except Exception:
            return StarletteResponse(
                status_code=401,
                headers={"WWW-Authenticate": "Basic realm='Admin'"},
                content="Invalid authorization header",
            )

        if secrets.compare_digest(username, ADMIN_USER) and secrets.compare_digest(
            password, ADMIN_PASSWORD
        ):
            return await call_next(request)

        return StarletteResponse(
            status_code=401,
            headers={"WWW-Authenticate": "Basic realm='Admin'"},
            content="Invalid credentials",
        )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


# Add security middlewares (must be added before routes are registered)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AdminAuthMiddleware)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
# Vite builds assets to /assets/ - mount separately for production (only if exists)
if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def generate_session_id() -> str:
    """Generate a cryptographically secure session identifier (128 bits)."""
    return secrets.token_urlsafe(16)


# Story ID validation pattern - alphanumeric, underscore, hyphen only
VALID_STORY_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def validate_story_id(story_id: str) -> str:
    """Validate story_id is safe for file path use. Raises HTTPException if invalid."""
    if not story_id or not VALID_STORY_ID_PATTERN.match(story_id):
        security_logger.warning(f"Invalid story ID rejected: {story_id!r}")
        raise HTTPException(status_code=400, detail="Invalid story ID format")
    return story_id


def load_state() -> "GameState | None":
    if not STATE_FILE.exists():
        return None
    try:
        with open(STATE_FILE) as f:
            data = json.load(f)
            if not data:
                return None
            # Migration: add session_id if missing (existing sessions)
            if "session_id" not in data or not data["session_id"]:
                data["session_id"] = generate_session_id()
                with open(STATE_FILE, "w") as fw:
                    json.dump(data, fw, indent=2)
            return GameState(**data)
    except (json.JSONDecodeError, Exception):
        return None


def save_state(state: "GameState | None"):
    if state is None:
        with open(STATE_FILE, "w") as f:
            f.write("{}")
    else:
        with open(STATE_FILE, "w") as f:
            json.dump(state.model_dump(), f, indent=2)


def get_current_scene(story: Story, scene_id: str) -> "Scene | None":
    for scene in story.scenes:
        if scene.id == scene_id:
            return scene
    return None


def build_resolved(state: "GameState | None") -> "dict | None":
    if state is None:
        return None
    story_path = STORIES_DIR / f"{state.story_id}.json"
    if not story_path.exists():
        return None
    with open(story_path) as f:
        story = Story(**json.load(f))

    char_desc = state.character.description if state.character else None
    fields = state.character.fields if state.character else None

    # Handle opening scene
    if state.status == SessionStatus.OPENING_SCENE_ACTIVE and story.opening_scene:
        scene_text = inject_variables(story.opening_scene.base_text, fields)
        for ct in story.opening_scene.conditional_text:
            if evaluate_condition(ct.condition, state):
                scene_text += " " + inject_variables(ct.text, fields)
        return {
            "scene_text": scene_text,
            "character_description": char_desc,
            "theme": story.theme.value,
            "visible_choices": [],
        }

    scene = get_current_scene(story, state.current_scene_id)
    if scene is None:
        return None
    scene_text = resolve_scene_text(scene, state)

    # Player-facing choice text, in the shuffled order, only once revealed.
    # Players never receive the story itself, so outcomes stay hidden.
    visible_choices = []
    if state.choices_revealed:
        visible_choices = [
            inject_variables(scene.choices[i].display_text, fields)
            for i in state.shuffled_indices
            if 0 <= i < len(scene.choices)
        ]

    resolved = {
        "scene_text": scene_text,
        "character_description": char_desc,
        "theme": story.theme.value,
        "visible_choices": visible_choices,
    }

    # Include resolved finale text with variable injection and item_text support
    if scene.victory_text:
        resolved["victory_text"] = inject_variables(
            scene.victory_text, fields, state, scene.item_texts, "victory"
        )
    if scene.defeat_text:
        resolved["defeat_text"] = inject_variables(
            scene.defeat_text, fields, state, scene.item_texts, "defeat"
        )

    return resolved


# In-memory SSE connection tracking
sse_connections: set = set()
storyteller_connections: set = set()  # Subset of sse_connections with valid token
player_connections: set = set()  # Subset of sse_connections with valid session_id
sse_lock = asyncio.Lock()


async def build_payload() -> dict:
    state = load_state()
    async with sse_lock:
        player_count = len(player_connections)
        storyteller_connected = len(storyteller_connections) > 0
    return {
        "type": "state",
        "state": state.model_dump() if state else None,
        "resolved": build_resolved(state),
        "player_count": player_count,
        "storyteller_connected": storyteller_connected,
    }


async def broadcast_state():
    message = f"data: {json.dumps(await build_payload())}\n\n"
    async with sse_lock:
        queues = list(sse_connections)
    for queue in queues:
        await queue.put(message)


class CreateStoryRequest(BaseModel):
    title: str


# Task 2.1: List Stories
@app.get("/api/stories")
async def list_stories(_: bool = Depends(verify_admin)) -> list[dict]:
    stories = []
    for path in STORIES_DIR.glob("*.json"):
        with open(path) as f:
            story = json.load(f)
            stories.append(
                {
                    "id": story["id"],
                    "title": story["title"],
                    "theme": story["theme"],
                    "scene_count": len(story.get("scenes", [])),
                }
            )
    return stories


# Task 2.2: Create Story
@app.post("/api/stories")
async def create_story(request: CreateStoryRequest, _: bool = Depends(verify_admin)) -> Story:
    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title cannot be empty")

    story_id = str(uuid.uuid4())[:8]
    story = Story(
        id=story_id,
        title=title,
        theme=ThemeName.CYBERPUNK,
        settings=StorySettings(),
        madlib_template=MadLibTemplate(prompt="", fields=[]),
        scenes=[],
    )
    story_path = STORIES_DIR / f"{story_id}.json"
    with open(story_path, "w") as f:
        json.dump(story.model_dump(), f, indent=2)
    return story


# Task 2.3: Get Single Story
@app.get("/api/stories/{story_id}")
async def get_story(story_id: str, _: bool = Depends(verify_admin)) -> Story:
    validate_story_id(story_id)
    story_path = STORIES_DIR / f"{story_id}.json"
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")
    with open(story_path) as f:
        return Story(**json.load(f))


# Task 2.4: Update Story
@app.put("/api/stories/{story_id}")
async def update_story(story_id: str, story: Story, _: bool = Depends(verify_admin)) -> Story:
    validate_story_id(story_id)
    if story.id != story_id:
        raise HTTPException(status_code=422, detail="Story id in body does not match URL")
    story_path = STORIES_DIR / f"{story_id}.json"
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")
    with open(story_path, "w") as f:
        json.dump(story.model_dump(), f, indent=2)
    return story


# Task 2.5: Delete Story
@app.delete("/api/stories/{story_id}")
async def delete_story(story_id: str, _: bool = Depends(verify_admin)):
    validate_story_id(story_id)
    story_path = STORIES_DIR / f"{story_id}.json"
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")

    # Clear state if this story is active
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            try:
                state = json.load(f)
                if state.get("story_id") == story_id:
                    with open(STATE_FILE, "w") as fw:
                        fw.write("{}")
            except json.JSONDecodeError:
                pass

    story_path.unlink()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Configuration endpoint (public)
# ---------------------------------------------------------------------------


@app.get("/api/config")
async def get_config():
    """Return public configuration values for frontend."""
    return {"base_url": BASE_URL or None}


@app.get("/api/session/check")
async def check_session(s: Optional[str] = None):
    """Public: is a session active, and does `s` match it? Never reveals the id."""
    state = load_state()
    active = state is not None
    valid = active and s is not None and secrets.compare_digest(s, state.session_id)
    return {"active": active, "valid": valid}


# SPA routes - serve index.html for client-side routing
# In production, STATIC_DIR contains the built React app
# In development, Vite dev server handles these routes

@app.get("/")
async def index():
    # Check for React build (index.html in STATIC_DIR root)
    react_index = STATIC_DIR / "index.html"
    if react_index.exists():
        return FileResponse(react_index)
    # Fallback to old vanilla JS pages
    return FileResponse(STATIC_DIR / "pages" / "index.html")


@app.get("/editor/{story_id:path}")
async def editor(story_id: str):
    react_index = STATIC_DIR / "index.html"
    if react_index.exists():
        return FileResponse(react_index)
    return FileResponse(STATIC_DIR / "pages" / "editor.html")


@app.get("/run")
async def run():
    react_index = STATIC_DIR / "index.html"
    if react_index.exists():
        return FileResponse(react_index)
    return FileResponse(STATIC_DIR / "pages" / "run.html")


@app.get("/player/{session_id}")
async def player_with_session(session_id: str):
    """Player view with session validation."""
    state = load_state()
    if state is None or state.session_id != session_id:
        return HTMLResponse(
            content="""<!DOCTYPE html>
<html>
<head>
    <title>Session Not Found</title>
    <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #1a1a2e; color: #eee; }
        h1 { color: #ff6b6b; }
        p { color: #aaa; }
    </style>
</head>
<body>
    <h1>Session Not Found</h1>
    <p>This session link is invalid or has expired.</p>
    <p>Ask the storyteller for a new link.</p>
</body>
</html>""",
            status_code=404,
        )
    react_index = STATIC_DIR / "index.html"
    if react_index.exists():
        return FileResponse(react_index)
    return FileResponse(STATIC_DIR / "pages" / "player.html")


@app.get("/player")
async def player_redirect():
    """Redirect bare /player to require session_id."""
    return HTMLResponse(
        content="""<!DOCTYPE html>
<html>
<head>
    <title>Session Link Required</title>
    <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #1a1a2e; color: #eee; }
        h1 { color: #f9ca24; }
        p { color: #aaa; }
    </style>
</head>
<body>
    <h1>Session Link Required</h1>
    <p>Please use the link provided by your storyteller to join the game.</p>
</body>
</html>""",
        status_code=400,
    )


# ---------------------------------------------------------------------------
# Task 5.1: SSE Endpoint
# ---------------------------------------------------------------------------


@app.get("/api/events")
async def sse_events(token: Optional[str] = None, s: Optional[str] = None):
    """SSE endpoint. Storyteller uses token param, players use s (session_id) param."""
    is_storyteller = (
        token is not None
        and _session_token is not None
        and secrets.compare_digest(token, _session_token)
    )
    state = load_state()
    is_player = (
        not is_storyteller
        and state is not None
        and s is not None
        and secrets.compare_digest(s, state.session_id)
    )

    # Anyone else is an observer: allowed only when there's nothing to protect
    if not is_storyteller and not is_player and not AUTH_DISABLED and state is not None:
        raise HTTPException(status_code=403, detail="Invalid session")

    queue = asyncio.Queue()

    async with sse_lock:
        sse_connections.add(queue)
        if is_storyteller:
            storyteller_connections.add(queue)
        if is_player:
            player_connections.add(queue)

    async def event_generator():
        try:
            yield f"data: {json.dumps(await build_payload())}\n\n"
            # Player count and storyteller presence changed for everyone else
            if is_storyteller or is_player:
                await broadcast_state()
            while True:
                message = await queue.get()
                if message is None:  # session ended: close so clients re-auth
                    break
                yield message
        except asyncio.CancelledError:
            pass
        finally:
            async with sse_lock:
                sse_connections.discard(queue)
                storyteller_connections.discard(queue)
                player_connections.discard(queue)
            if is_storyteller or is_player:
                await broadcast_state()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )


# ---------------------------------------------------------------------------
# Session state request models
# ---------------------------------------------------------------------------


class StartRequest(BaseModel):
    story_id: str


class StartResponse(BaseModel):
    state: GameState
    token: str


class MadlibRequest(BaseModel):
    answer: str = Field(..., min_length=1, max_length=500)


class ChoiceRequest(BaseModel):
    choice_index: int


class FinishRequest(BaseModel):
    outcome: Literal["victory", "defeat"]


class SelectSceneRequest(BaseModel):
    scene_id: str
    revisit: bool = False  # If true, this is a revisit of an already-played scene


# ---------------------------------------------------------------------------
# Task 4.1: GET /api/state
# ---------------------------------------------------------------------------


@app.get("/api/state")
async def get_state(s: Optional[str] = None, x_session_token: Optional[str] = Header(None)):
    """Get current state. Requires either valid session_id (player) or token (storyteller)."""
    state = load_state()

    # Determine access level
    is_storyteller = bool(
        x_session_token and _session_token and secrets.compare_digest(x_session_token, _session_token)
    )
    has_valid_session = bool(s and state and secrets.compare_digest(s, state.session_id))
    no_active_session = state is None  # Nothing to protect

    # Allow if: storyteller, valid session_id, no active session, or auth disabled
    if not is_storyteller and not has_valid_session and not no_active_session and not AUTH_DISABLED:
        raise HTTPException(status_code=403, detail="Authentication required")

    resolved = build_resolved(state)
    async with sse_lock:
        storyteller_connected = len(storyteller_connections) > 0
    return {
        "state": state.model_dump() if state else None,
        "resolved": resolved,
        "storyteller_connected": storyteller_connected,
    }


# ---------------------------------------------------------------------------
# Task 4.2: POST /api/state/start
# ---------------------------------------------------------------------------


@app.post("/api/state/start")
async def start_session(request: StartRequest, _: bool = Depends(verify_admin)) -> StartResponse:
    global _session_token

    validate_story_id(request.story_id)
    story_path = STORIES_DIR / f"{request.story_id}.json"
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")

    with open(story_path) as f:
        story = Story(**json.load(f))

    if not story.scenes:
        raise HTTPException(status_code=422, detail="Story has no scenes")

    first_scene_id = story.scenes[0].id

    if story.madlib_template.fields:
        status = SessionStatus.MADLIB_IN_PROGRESS
    elif story.opening_scene:
        status = SessionStatus.OPENING_SCENE_ACTIVE
    else:
        status = SessionStatus.RUNNING

    state = GameState(
        session_id=generate_session_id(),
        story_id=request.story_id,
        status=status,
        madlib_step=0,
        madlib_answers={},
        current_scene_id=first_scene_id,
        hp=story.settings.starting_hp,
        level=1,
        items=[],
        history=[],
        character=None,
        outcome=None,
    )

    # Generate session token for storyteller
    _session_token = secrets.token_urlsafe(32)

    save_state(state)
    await broadcast_state()
    return StartResponse(state=state, token=_session_token)


# ---------------------------------------------------------------------------
# Task 4.3: POST /api/state/madlib
# ---------------------------------------------------------------------------


@app.post("/api/state/madlib")
async def submit_madlib(
    request: MadlibRequest,
    _: bool = Depends(verify_storyteller),
    __: None = Depends(rate_limit_dependency),
) -> GameState:
    state = load_state()
    if state is None or state.status != SessionStatus.MADLIB_IN_PROGRESS:
        raise HTTPException(status_code=409, detail="Not in madlib_in_progress status")

    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))

    fields = story.madlib_template.fields
    current_field = fields[state.madlib_step]

    state.madlib_answers[current_field.key] = request.answer
    state.madlib_step += 1

    if state.madlib_step >= len(fields):
        # All fields answered — build Character
        fields_dict = dict(state.madlib_answers)
        # Build description by injecting variables into the prompt
        description = inject_variables(story.madlib_template.prompt, fields_dict)
        # Use the "name" field as character name if present, else first field value
        name_val = fields_dict.get(
            "name", next(iter(fields_dict.values()), "Adventurer")
        )
        state.character = Character(
            name=name_val,
            description=description,
            fields=fields_dict,
        )
        # Go to character reveal so storyteller can read to players
        state.status = SessionStatus.CHARACTER_REVEAL

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# POST /api/state/madlib-back - Go back to previous madlib field
# ---------------------------------------------------------------------------


@app.post("/api/state/madlib-back")
async def madlib_back(_: bool = Depends(verify_storyteller)) -> GameState:
    """Go back to the previous madlib field to edit the answer."""
    state = load_state()
    if state is None or state.status != SessionStatus.MADLIB_IN_PROGRESS:
        raise HTTPException(status_code=409, detail="Not in madlib_in_progress status")

    if state.madlib_step <= 0:
        raise HTTPException(status_code=409, detail="Already at first field")

    state.madlib_step -= 1
    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# POST /api/state/proceed-from-character - Continue after character reveal
# ---------------------------------------------------------------------------


@app.post("/api/state/proceed-from-character")
async def proceed_from_character(_: bool = Depends(verify_storyteller)) -> GameState:
    """Proceed from character reveal to opening scene or running."""
    state = load_state()
    if state is None or state.status != SessionStatus.CHARACTER_REVEAL:
        raise HTTPException(status_code=409, detail="Not in character_reveal status")

    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))

    # Check for opening scene before going to running
    if story.opening_scene:
        state.status = SessionStatus.OPENING_SCENE_ACTIVE
    else:
        state.status = SessionStatus.RUNNING

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# Task 4.4: POST /api/state/choice
# ---------------------------------------------------------------------------


@app.post("/api/state/choice")
async def make_choice(
    request: ChoiceRequest,
    _: bool = Depends(verify_storyteller),
    __: None = Depends(rate_limit_dependency),
) -> GameState:
    state = load_state()
    if state is None or state.status != SessionStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Not in running status")

    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))

    scene = get_current_scene(story, state.current_scene_id)
    if scene is None:
        raise HTTPException(status_code=422, detail="Current scene not found")

    if request.choice_index < 0 or request.choice_index >= len(scene.choices):
        raise HTTPException(status_code=422, detail="Invalid choice index")

    # Map visual index to original index if choices were shuffled
    original_index = request.choice_index
    if state.shuffled_indices and request.choice_index < len(state.shuffled_indices):
        original_index = state.shuffled_indices[request.choice_index]

    choice = scene.choices[original_index]

    # Validate item choices have item_name
    if choice.kind == ChoiceKind.ITEM and not choice.item_name:
        raise HTTPException(status_code=422, detail="Item choice must have item_name")

    # Apply outcome
    item_name: Optional[str] = None
    if choice.kind == ChoiceKind.DAMAGE:
        state.hp -= choice.amount
    elif choice.kind == ChoiceKind.ITEM:
        item_name = choice.item_name
        if item_name:
            state.items.append(item_name)
    elif choice.kind == ChoiceKind.LEVEL:
        state.level += 1

    # Record history (use original_index for replay consistency)
    entry = HistoryEntry(
        scene_id=state.current_scene_id,
        outcome=choice.kind,
        choice_index=original_index,
        item_name=item_name,
        damage_amount=choice.amount,
    )
    state.history.append(entry)

    # Determine next state
    if state.hp <= 0:
        state.hp = 0
        state.status = SessionStatus.GAME_OVER
        state.outcome = "defeat"
        state.outcome_revealed = True
    else:
        # Check how many scenes remain unplayed
        played_scene_ids = {h.scene_id for h in state.history}
        unplayed_scenes = [s for s in story.scenes if s.id not in played_scene_ids]

        if len(unplayed_scenes) == 0:
            # All scenes played - finale
            state.status = SessionStatus.GAME_OVER
            state.outcome = None  # awaiting physical dice roll
        elif story.settings.non_linear:
            # Non-linear mode: wait for storyteller to select next scene
            state.status = SessionStatus.AWAITING_SCENE_SELECTION
        else:
            # Linear mode: auto-advance to next scene in array order
            scene_ids = [s.id for s in story.scenes]
            current_index = scene_ids.index(state.current_scene_id)
            is_last_scene = current_index == len(scene_ids) - 1

            if is_last_scene:
                state.status = SessionStatus.GAME_OVER
                state.outcome = None  # awaiting physical dice roll
            else:
                state.current_scene_id = scene_ids[current_index + 1]

    # Reset choice reveal state for next scene
    state.choices_revealed = False
    state.shuffled_indices = []

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# Task 4.5: POST /api/state/back
# ---------------------------------------------------------------------------


@app.post("/api/state/back")
async def go_back(_: bool = Depends(verify_storyteller)) -> GameState:
    state = load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")

    # No-op during madlib_in_progress
    if state.status == SessionStatus.MADLIB_IN_PROGRESS:
        return state

    # No-op if history is empty
    if not state.history:
        return state

    # If we were game_over, return to running first
    was_game_over = state.status == SessionStatus.GAME_OVER

    # Pop last history entry — the scene we want to return to
    popped = state.history.pop()

    # Load story to get starting_hp
    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))

    # Replay remaining history to recalculate hp/level/items
    hp, level, items = replay_history(state.history, story.settings.starting_hp)

    state.hp = hp
    state.level = level
    state.items = items
    state.current_scene_id = popped.scene_id
    state.status = SessionStatus.RUNNING
    state.outcome = None
    state.outcome_revealed = False
    # The shuffle belonged to whatever scene we were on; the restored scene re-reveals
    state.choices_revealed = False
    state.shuffled_indices = []

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# Select next scene (non-linear mode)
# ---------------------------------------------------------------------------


@app.post("/api/state/select-scene")
async def select_scene(request: SelectSceneRequest, _: bool = Depends(verify_storyteller)) -> GameState:
    state = load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")
    if state.status != SessionStatus.AWAITING_SCENE_SELECTION:
        raise HTTPException(status_code=409, detail=f"Cannot select scene in status: {state.status}")

    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))

    # Validate scene exists
    scene = next((s for s in story.scenes if s.id == request.scene_id), None)
    if not scene:
        raise HTTPException(status_code=400, detail=f"Scene not found: {request.scene_id}")

    # Check if this is a finale scene and validate access
    if scene.is_finale:
        non_finale_scenes = [s for s in story.scenes if not s.is_finale]
        played_ids = {h.scene_id for h in state.history}
        unplayed_non_finale = [s for s in non_finale_scenes if s.id not in played_ids]
        if unplayed_non_finale:
            raise HTTPException(
                status_code=400,
                detail="Complete all scenes before accessing the finale"
            )

    # Check if scene was already played
    played_ids = {h.scene_id for h in state.history}
    if request.scene_id in played_ids:
        if not request.revisit:
            raise HTTPException(status_code=400, detail=f"Scene already played: {request.scene_id}")
        # Revisit: remove this scene's history entry and recalculate state
        state.history = [h for h in state.history if h.scene_id != request.scene_id]
        hp, level, items = replay_history(state.history, story.settings.starting_hp)
        state.hp = hp
        state.level = level
        state.items = items

    state.current_scene_id = request.scene_id
    state.status = SessionStatus.RUNNING
    state.choices_revealed = False
    state.shuffled_indices = []

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# Reveal choices to players
# ---------------------------------------------------------------------------


@app.post("/api/state/reveal-choices")
async def reveal_choices(
    show_to_players: bool = True,
    _: bool = Depends(verify_storyteller),
) -> GameState:
    """Shuffle and optionally reveal choices to players.

    - show_to_players=false: Just shuffle (for storyteller's local reveal)
    - show_to_players=true: Shuffle + broadcast to players
    """
    state = load_state()
    if state is None or state.status != SessionStatus.RUNNING:
        raise HTTPException(status_code=409, detail="No running session")

    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))
    scene = next((s for s in story.scenes if s.id == state.current_scene_id), None)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    # Only shuffle on first reveal - preserve order for subsequent calls
    if not state.shuffled_indices:
        indices = list(range(len(scene.choices)))
        random.shuffle(indices)
        state.shuffled_indices = indices

    if show_to_players:
        state.choices_revealed = True

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# POST /api/state/opening-choice - Handle opening scene choice
# ---------------------------------------------------------------------------


class OpeningChoiceRequest(BaseModel):
    choice_index: Optional[int] = None  # None = "proceed" button clicked


@app.post("/api/state/opening-choice")
async def make_opening_choice(
    request: OpeningChoiceRequest, _: bool = Depends(verify_storyteller)
) -> GameState:
    state = load_state()
    if state is None or state.status != SessionStatus.OPENING_SCENE_ACTIVE:
        raise HTTPException(status_code=409, detail="Not in opening_scene_active status")

    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))

    if not story.opening_scene:
        raise HTTPException(status_code=500, detail="Story has no opening scene")

    first_scene_id = story.scenes[0].id if story.scenes else None

    if request.choice_index is not None:
        # Validate choice index
        if request.choice_index < 0 or request.choice_index >= len(story.opening_scene.choices):
            raise HTTPException(status_code=422, detail="Invalid choice index")

        choice = story.opening_scene.choices[request.choice_index]

        if choice.target_scene_id:
            # Validate target scene exists
            scene_ids = {s.id for s in story.scenes}
            if choice.target_scene_id not in scene_ids:
                raise HTTPException(status_code=422, detail="Invalid target scene")
            state.current_scene_id = choice.target_scene_id
            state.status = SessionStatus.RUNNING
        else:
            # No target - go to scene selection
            state.status = SessionStatus.AWAITING_SCENE_SELECTION
    else:
        # No choice made (proceed button or no choices available)
        if story.settings.non_linear:
            state.status = SessionStatus.AWAITING_SCENE_SELECTION
        else:
            if first_scene_id:
                state.current_scene_id = first_scene_id
            state.status = SessionStatus.RUNNING

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# Task 4.6: POST /api/state/finish and POST /api/state/restart
# ---------------------------------------------------------------------------


@app.post("/api/state/finish")
async def finish_session(request: FinishRequest, _: bool = Depends(verify_storyteller)) -> GameState:
    state = load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")

    # Accept game_over status OR running status on a finale scene
    if state.status == SessionStatus.GAME_OVER:
        pass  # Already in game_over, proceed
    elif state.status == SessionStatus.RUNNING:
        # Check if current scene is a finale
        story_path = STORIES_DIR / f"{state.story_id}.json"
        with open(story_path) as f:
            story = Story(**json.load(f))
        current_scene = next((s for s in story.scenes if s.id == state.current_scene_id), None)
        if not current_scene or not current_scene.is_finale:
            raise HTTPException(status_code=409, detail="Can only finish from finale scene or game_over status")
        # Transition to game_over
        state.status = SessionStatus.GAME_OVER
    else:
        raise HTTPException(status_code=409, detail=f"Cannot finish in status: {state.status}")

    state.outcome = request.outcome
    state.outcome_revealed = True
    save_state(state)
    await broadcast_state()
    return state


@app.post("/api/state/reveal-outcome")
async def reveal_outcome(_: bool = Depends(verify_storyteller)) -> GameState:
    """Reveal the outcome to players after storyteller has read the narrative."""
    state = load_state()
    if state is None or state.status != SessionStatus.GAME_OVER:
        raise HTTPException(status_code=409, detail="Not in game_over status")
    if state.outcome is None:
        raise HTTPException(status_code=409, detail="Outcome not set yet")

    state.outcome_revealed = True
    save_state(state)
    await broadcast_state()
    return state


@app.get("/api/state/validate-token")
async def validate_token(x_session_token: Optional[str] = Header(None)):
    """Check if the provided token is valid for the current session."""
    if _session_token is None:
        return {"valid": False, "reason": "no_session", "is_storyteller": False}
    if x_session_token and secrets.compare_digest(x_session_token, _session_token):
        return {"valid": True, "is_storyteller": True}
    return {"valid": False, "reason": "invalid_token", "is_storyteller": False}


@app.post("/api/state/restart")
async def restart_session(_: bool = Depends(verify_storyteller)):
    """Restart clears the session. Requires storyteller authentication."""
    global _session_token

    # Broadcast session_ended to all clients BEFORE clearing token
    # This ensures players receive the notification before being disconnected
    async with sse_lock:
        queues = list(sse_connections)
    payload = {"type": "session_ended"}
    message = f"data: {json.dumps(payload)}\n\n"
    for queue in queues:
        await queue.put(message)
        await queue.put(None)  # then close the stream

    _session_token = None
    # Token and session_id are now invalid, so nobody is a storyteller or player
    async with sse_lock:
        storyteller_connections.clear()
        player_connections.clear()
    save_state(None)
    return {"status": "restarted"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
