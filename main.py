import json
import re
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
