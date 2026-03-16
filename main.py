import asyncio
import json
import re
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pathlib import Path
from enum import Enum
from typing import Optional, Literal

from pydantic import BaseModel


class ThemeName(str, Enum):
    CYBERPUNK = "cyberpunk"
    FANTASY = "fantasy"
    DEEP_SPACE = "deep_space"
    MODERN = "modern"
    HORROR = "horror"


class SessionStatus(str, Enum):
    MADLIB_IN_PROGRESS = "madlib_in_progress"
    RUNNING = "running"
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


class Choice(BaseModel):
    kind: ChoiceKind
    text: str
    amount: int = 1
    item_name: Optional[str] = None


class Scene(BaseModel):
    id: str
    title: str
    base_text: str
    choices: list[Choice]
    conditional_text: list[ConditionalText] = []


class MadLibField(BaseModel):
    key: str
    label: str


class MadLibTemplate(BaseModel):
    prompt: str
    fields: list[MadLibField]


class StorySettings(BaseModel):
    starting_hp: int = 3


class Story(BaseModel):
    id: str
    title: str
    theme: ThemeName = ThemeName.CYBERPUNK
    settings: StorySettings = StorySettings()
    madlib_template: MadLibTemplate
    scenes: list[Scene]


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


def inject_variables(text: str, fields: dict[str, str] | None) -> str:
    """Replace {key} placeholders with values from fields dict."""
    if not fields:
        return text

    def replace(match):
        key = match.group(1)
        return fields.get(key, match.group(0))

    return re.sub(r"\{(\w+)\}", replace, text)


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


def replay_history(history: list[HistoryEntry], starting_hp: int) -> tuple[int, int, list[str]]:
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


app = FastAPI(title="J&B's RPG")

STATIC_DIR = Path(__file__).parent / "static"
STORIES_DIR = Path(__file__).parent / "stories"
STATE_FILE = Path(__file__).parent / "state.json"

# Ensure directories exist
STORIES_DIR.mkdir(exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def load_state() -> "GameState | None":
    if not STATE_FILE.exists():
        return None
    try:
        with open(STATE_FILE) as f:
            data = json.load(f)
            if not data:
                return None
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
    scene = get_current_scene(story, state.current_scene_id)
    if scene is None:
        return None
    scene_text = resolve_scene_text(scene, state)
    char_desc = state.character.description if state.character else None
    return {"scene_text": scene_text, "character_description": char_desc}


# In-memory SSE connection tracking
sse_connections: set = set()
sse_lock = asyncio.Lock()


async def broadcast_state():
    state = load_state()
    resolved = build_resolved(state)

    async with sse_lock:
        connected = len(sse_connections)
        queues = list(sse_connections)

    payload = {
        "type": "state",
        "state": state.model_dump() if state else None,
        "resolved": resolved,
        "connected_count": connected,
    }
    message = f"data: {json.dumps(payload)}\n\n"

    dead = set()
    for queue in queues:
        try:
            await queue.put(message)
        except Exception:
            dead.add(queue)

    if dead:
        async with sse_lock:
            sse_connections.difference_update(dead)


class CreateStoryRequest(BaseModel):
    title: str


# Task 2.1: List Stories
@app.get("/api/stories")
async def list_stories() -> list[dict]:
    stories = []
    for path in STORIES_DIR.glob("*.json"):
        with open(path) as f:
            story = json.load(f)
            stories.append({
                "id": story["id"],
                "title": story["title"],
                "theme": story["theme"],
                "scene_count": len(story.get("scenes", [])),
            })
    return stories


# Task 2.2: Create Story
@app.post("/api/stories")
async def create_story(request: CreateStoryRequest) -> Story:
    story_id = str(uuid.uuid4())[:8]
    story = Story(
        id=story_id,
        title=request.title,
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
async def get_story(story_id: str) -> Story:
    story_path = STORIES_DIR / f"{story_id}.json"
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")
    with open(story_path) as f:
        return Story(**json.load(f))


# Task 2.4: Update Story
@app.put("/api/stories/{story_id}")
async def update_story(story_id: str, story: Story) -> Story:
    story_path = STORIES_DIR / f"{story_id}.json"
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")
    with open(story_path, "w") as f:
        json.dump(story.model_dump(), f, indent=2)
    return story


# Task 2.5: Delete Story
@app.delete("/api/stories/{story_id}")
async def delete_story(story_id: str):
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


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "pages" / "index.html")


@app.get("/editor")
async def editor():
    return FileResponse(STATIC_DIR / "pages" / "editor.html")


@app.get("/run")
async def run():
    return FileResponse(STATIC_DIR / "pages" / "run.html")


@app.get("/player")
async def player():
    return FileResponse(STATIC_DIR / "pages" / "player.html")


# ---------------------------------------------------------------------------
# Task 5.1: SSE Endpoint
# ---------------------------------------------------------------------------

@app.get("/api/events")
async def sse_events():
    queue = asyncio.Queue()

    async with sse_lock:
        sse_connections.add(queue)

    async def event_generator():
        try:
            # Send initial state
            async with sse_lock:
                connected = len(sse_connections)

            state = load_state()
            resolved = build_resolved(state)
            payload = {
                "type": "state",
                "state": state.model_dump() if state else None,
                "resolved": resolved,
                "connected_count": connected
            }
            yield f"data: {json.dumps(payload)}\n\n"

            # Send updates
            while True:
                message = await queue.get()
                yield message
        except asyncio.CancelledError:
            pass
        finally:
            async with sse_lock:
                sse_connections.discard(queue)

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


class MadlibRequest(BaseModel):
    answer: str


class ChoiceRequest(BaseModel):
    choice_index: int


class FinishRequest(BaseModel):
    outcome: Literal["victory", "defeat"]


# ---------------------------------------------------------------------------
# Task 4.1: GET /api/state
# ---------------------------------------------------------------------------

@app.get("/api/state")
async def get_state():
    state = load_state()
    resolved = build_resolved(state)
    return {
        "state": state.model_dump() if state else None,
        "resolved": resolved,
    }


# ---------------------------------------------------------------------------
# Task 4.2: POST /api/state/start
# ---------------------------------------------------------------------------

@app.post("/api/state/start")
async def start_session(request: StartRequest) -> GameState:
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
    else:
        status = SessionStatus.RUNNING

    state = GameState(
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

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# Task 4.3: POST /api/state/madlib
# ---------------------------------------------------------------------------

@app.post("/api/state/madlib")
async def submit_madlib(request: MadlibRequest) -> GameState:
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
        name_val = fields_dict.get("name", next(iter(fields_dict.values()), "Adventurer"))
        state.character = Character(
            name=name_val,
            description=description,
            fields=fields_dict,
        )
        state.status = SessionStatus.RUNNING

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# Task 4.4: POST /api/state/choice
# ---------------------------------------------------------------------------

@app.post("/api/state/choice")
async def make_choice(request: ChoiceRequest) -> GameState:
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

    choice = scene.choices[request.choice_index]

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

    # Record history
    entry = HistoryEntry(
        scene_id=state.current_scene_id,
        outcome=choice.kind,
        choice_index=request.choice_index,
        item_name=item_name,
        damage_amount=choice.amount,
    )
    state.history.append(entry)

    # Determine next state
    if state.hp <= 0:
        state.hp = 0
        state.status = SessionStatus.GAME_OVER
        state.outcome = "defeat"
    else:
        # Find index of current scene
        scene_ids = [s.id for s in story.scenes]
        current_index = scene_ids.index(state.current_scene_id)
        is_last_scene = current_index == len(scene_ids) - 1

        if is_last_scene:
            state.status = SessionStatus.GAME_OVER
            state.outcome = None  # awaiting physical dice roll
        else:
            state.current_scene_id = scene_ids[current_index + 1]

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# Task 4.5: POST /api/state/back
# ---------------------------------------------------------------------------

@app.post("/api/state/back")
async def go_back() -> GameState:
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

    save_state(state)
    await broadcast_state()
    return state


# ---------------------------------------------------------------------------
# Task 4.6: POST /api/state/finish and POST /api/state/restart
# ---------------------------------------------------------------------------

@app.post("/api/state/finish")
async def finish_session(request: FinishRequest) -> GameState:
    state = load_state()
    if state is None or state.status != SessionStatus.GAME_OVER:
        raise HTTPException(status_code=409, detail="Not in game_over status")

    state.outcome = request.outcome
    save_state(state)
    await broadcast_state()
    return state


@app.post("/api/state/restart")
async def restart_session():
    save_state(None)
    await broadcast_state()
    return {"status": "restarted"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
