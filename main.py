from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from enum import Enum
from typing import Optional, Literal


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


from pydantic import BaseModel


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


app = FastAPI(title="J&B's RPG")

STATIC_DIR = Path(__file__).parent / "static"
STORIES_DIR = Path(__file__).parent / "stories"
STATE_FILE = Path(__file__).parent / "state.json"

# Ensure directories exist
STORIES_DIR.mkdir(exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "pages" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
