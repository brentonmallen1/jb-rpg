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
