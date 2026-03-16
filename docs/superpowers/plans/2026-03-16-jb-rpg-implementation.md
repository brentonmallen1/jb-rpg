# J&B's RPG Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TTRPG companion app with story editor, real-time player view, and session management.

**Architecture:** FastAPI backend serves REST API + SSE for real-time sync. Vanilla HTML/CSS/JS frontend with 4 pages. Flat file persistence (JSON). No database, no build tools.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, uvicorn, vanilla JS, CSS custom properties for theming.

---

## File Structure

```
jb-rpg/
├── main.py                           # FastAPI app - all routes, SSE, models
├── stories/                          # Story JSON files (created at runtime)
├── state.json                        # Session state (created at runtime)
├── static/
│   ├── css/
│   │   ├── base.css                  # Shared styles, light/dark mode
│   │   └── themes/
│   │       ├── cyberpunk.css
│   │       ├── fantasy.css
│   │       ├── deep_space.css
│   │       ├── modern.css
│   │       └── horror.css
│   ├── js/
│   │   ├── api.js                    # API client functions
│   │   ├── sse.js                    # SSE connection with reconnect
│   │   ├── theme.js                  # Theme/dark mode management
│   │   ├── library.js                # Story library page logic
│   │   ├── editor.js                 # Editor page logic
│   │   ├── run.js                    # Run view logic
│   │   └── player.js                 # Player view logic
│   └── pages/
│       ├── index.html                # Story library
│       ├── editor.html               # Story editor
│       ├── run.html                  # Storyteller run view
│       └── player.html               # Player status view
└── tests/
    ├── test_models.py                # Pydantic model tests
    ├── test_story_api.py             # Story CRUD tests
    ├── test_state_api.py             # Session state tests
    └── test_state_engine.py          # Condition eval, variable injection
```

---

## Chunk 1: Backend Foundation

### Task 1.1: Project Setup

**Files:**
- Create: `main.py`
- Create: `requirements.txt`
- Create: `tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
pydantic>=2.5.0
pytest>=8.0.0
httpx>=0.26.0
```

- [ ] **Step 2: Create main.py with minimal app**

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

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
```

- [ ] **Step 3: Create empty test init**

```python
# tests/__init__.py
```

- [ ] **Step 4: Create static directory structure**

```bash
mkdir -p static/css/themes static/js static/pages
```

- [ ] **Step 5: Create minimal index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>J&B's RPG</title>
</head>
<body>
    <h1>Story Library</h1>
    <p>Coming soon...</p>
</body>
</html>
```

- [ ] **Step 6: Verify app starts**

Run: `python main.py`
Expected: Server starts on http://0.0.0.0:8000

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: initial project setup with FastAPI"
```

---

### Task 1.2: Pydantic Models - Enums and Basic Types

**Files:**
- Modify: `main.py`
- Create: `tests/test_models.py`

- [ ] **Step 1: Write test for enums**

```python
# tests/test_models.py
import pytest


def test_theme_name_values():
    from main import ThemeName
    assert ThemeName.CYBERPUNK.value == "cyberpunk"
    assert ThemeName.FANTASY.value == "fantasy"
    assert ThemeName.DEEP_SPACE.value == "deep_space"
    assert ThemeName.MODERN.value == "modern"
    assert ThemeName.HORROR.value == "horror"


def test_session_status_values():
    from main import SessionStatus
    assert SessionStatus.MADLIB_IN_PROGRESS.value == "madlib_in_progress"
    assert SessionStatus.RUNNING.value == "running"
    assert SessionStatus.GAME_OVER.value == "game_over"


def test_choice_kind_values():
    from main import ChoiceKind
    assert ChoiceKind.DAMAGE.value == "damage"
    assert ChoiceKind.ITEM.value == "item"
    assert ChoiceKind.LEVEL.value == "level"


def test_condition_type_values():
    from main import ConditionType
    assert ConditionType.HP.value == "hp"
    assert ConditionType.ITEMS.value == "items"
    assert ConditionType.LEVEL.value == "level"
    assert ConditionType.SCENE_OUTCOME.value == "scene_outcome"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_models.py -v`
Expected: FAIL with "cannot import name 'ThemeName'"

- [ ] **Step 3: Implement enums in main.py**

Add after imports in `main.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/
git commit -m "feat: add enum types for themes, status, choices, conditions"
```

---

### Task 1.3: Pydantic Models - Story Components

**Files:**
- Modify: `main.py`
- Modify: `tests/test_models.py`

- [ ] **Step 1: Write tests for story models**

Append to `tests/test_models.py`:

```python
def test_condition_hp():
    from main import Condition, ConditionType
    c = Condition(type=ConditionType.HP, op="lte", value=1)
    assert c.type == ConditionType.HP
    assert c.op == "lte"
    assert c.value == 1


def test_condition_scene_outcome():
    from main import Condition, ConditionType
    c = Condition(type=ConditionType.SCENE_OUTCOME, scene_id="scene_1", outcome="damage")
    assert c.scene_id == "scene_1"
    assert c.outcome == "damage"


def test_choice_damage():
    from main import Choice, ChoiceKind
    c = Choice(kind=ChoiceKind.DAMAGE, text="Take the risk", amount=1)
    assert c.kind == ChoiceKind.DAMAGE
    assert c.amount == 1
    assert c.item_name is None


def test_choice_item():
    from main import Choice, ChoiceKind
    c = Choice(kind=ChoiceKind.ITEM, text="Search", item_name="Compass", amount=1)
    assert c.item_name == "Compass"


def test_scene():
    from main import Scene, Choice, ChoiceKind
    s = Scene(
        id="scene_1",
        title="The Start",
        base_text="You enter.",
        choices=[
            Choice(kind=ChoiceKind.DAMAGE, text="Fight", amount=1),
            Choice(kind=ChoiceKind.ITEM, text="Search", item_name="Key", amount=1),
            Choice(kind=ChoiceKind.LEVEL, text="Study", amount=1),
        ]
    )
    assert s.id == "scene_1"
    assert len(s.choices) == 3
    assert s.conditional_text == []


def test_madlib_template():
    from main import MadLibTemplate, MadLibField
    t = MadLibTemplate(
        prompt="{name} is a {job}",
        fields=[
            MadLibField(key="name", label="Enter a name"),
            MadLibField(key="job", label="Enter a job"),
        ]
    )
    assert len(t.fields) == 2
    assert t.fields[0].key == "name"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_models.py::test_condition_hp -v`
Expected: FAIL with "cannot import name 'Condition'"

- [ ] **Step 3: Implement story models**

Add to `main.py` after enums:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_models.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_models.py
git commit -m "feat: add Pydantic models for story, scenes, conditions, choices"
```

---

### Task 1.4: Pydantic Models - Game State

**Files:**
- Modify: `main.py`
- Modify: `tests/test_models.py`

- [ ] **Step 1: Write tests for state models**

Append to `tests/test_models.py`:

```python
def test_history_entry():
    from main import HistoryEntry, ChoiceKind
    h = HistoryEntry(
        scene_id="scene_1",
        outcome=ChoiceKind.DAMAGE,
        choice_index=0,
        damage_amount=1
    )
    assert h.scene_id == "scene_1"
    assert h.outcome == ChoiceKind.DAMAGE
    assert h.item_name is None


def test_character():
    from main import Character
    c = Character(
        name="Bob",
        description="Bob is a wizard.",
        fields={"name": "Bob", "class": "wizard"}
    )
    assert c.name == "Bob"
    assert c.fields["class"] == "wizard"


def test_game_state_defaults():
    from main import GameState, SessionStatus
    g = GameState(
        story_id="test",
        current_scene_id="scene_1",
        hp=3
    )
    assert g.status == SessionStatus.MADLIB_IN_PROGRESS
    assert g.level == 1
    assert g.items == []
    assert g.history == []
    assert g.character is None
    assert g.outcome is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_models.py::test_history_entry -v`
Expected: FAIL with "cannot import name 'HistoryEntry'"

- [ ] **Step 3: Implement state models**

Add to `main.py` after Story model:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_models.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_models.py
git commit -m "feat: add Pydantic models for game state, history, character"
```

---

## Chunk 2: Story CRUD API

### Task 2.1: List Stories Endpoint

**Files:**
- Modify: `main.py`
- Create: `tests/test_story_api.py`

- [ ] **Step 1: Write test for empty list**

```python
# tests/test_story_api.py
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import shutil


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Create test client with isolated stories directory."""
    import main
    monkeypatch.setattr(main, "STORIES_DIR", tmp_path / "stories")
    monkeypatch.setattr(main, "STATE_FILE", tmp_path / "state.json")
    main.STORIES_DIR.mkdir(exist_ok=True)
    return TestClient(main.app)


def test_list_stories_empty(client):
    response = client.get("/api/stories")
    assert response.status_code == 200
    assert response.json() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_story_api.py::test_list_stories_empty -v`
Expected: FAIL with 404 (route not found)

- [ ] **Step 3: Implement list stories endpoint**

Add to `main.py` before the index route:

```python
import json


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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_story_api.py::test_list_stories_empty -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_story_api.py
git commit -m "feat: add GET /api/stories endpoint"
```

---

### Task 2.2: Create Story Endpoint

**Files:**
- Modify: `main.py`
- Modify: `tests/test_story_api.py`

- [ ] **Step 1: Write test for create story**

Append to `tests/test_story_api.py`:

```python
def test_create_story(client):
    response = client.post("/api/stories", json={"title": "My Adventure"})
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "My Adventure"
    assert data["theme"] == "cyberpunk"
    assert data["settings"]["starting_hp"] == 3
    assert data["scenes"] == []
    assert data["madlib_template"]["fields"] == []
    assert "id" in data


def test_create_story_appears_in_list(client):
    client.post("/api/stories", json={"title": "Test Story"})
    response = client.get("/api/stories")
    assert len(response.json()) == 1
    assert response.json()[0]["title"] == "Test Story"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_story_api.py::test_create_story -v`
Expected: FAIL with 404 or 405

- [ ] **Step 3: Implement create story endpoint**

Add to `main.py`:

```python
import uuid


class CreateStoryRequest(BaseModel):
    title: str


@app.post("/api/stories")
async def create_story(request: CreateStoryRequest) -> Story:
    story_id = str(uuid.uuid4())[:8]
    story = Story(
        id=story_id,
        title=request.title,
        theme=ThemeName.CYBERPUNK,
        settings=StorySettings(),
        madlib_template=MadLibTemplate(prompt="", fields=[]),
        scenes=[]
    )
    story_path = STORIES_DIR / f"{story_id}.json"
    with open(story_path, "w") as f:
        json.dump(story.model_dump(), f, indent=2)
    return story
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_story_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_story_api.py
git commit -m "feat: add POST /api/stories endpoint"
```

---

### Task 2.3: Get Single Story Endpoint

**Files:**
- Modify: `main.py`
- Modify: `tests/test_story_api.py`

- [ ] **Step 1: Write tests**

Append to `tests/test_story_api.py`:

```python
def test_get_story(client):
    create_resp = client.post("/api/stories", json={"title": "Get Test"})
    story_id = create_resp.json()["id"]

    response = client.get(f"/api/stories/{story_id}")
    assert response.status_code == 200
    assert response.json()["title"] == "Get Test"


def test_get_story_not_found(client):
    response = client.get("/api/stories/nonexistent")
    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_story_api.py::test_get_story -v`
Expected: FAIL with 404

- [ ] **Step 3: Implement get story endpoint**

Add to `main.py`:

```python
from fastapi import HTTPException


@app.get("/api/stories/{story_id}")
async def get_story(story_id: str) -> Story:
    story_path = STORIES_DIR / f"{story_id}.json"
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")
    with open(story_path) as f:
        return Story(**json.load(f))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_story_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_story_api.py
git commit -m "feat: add GET /api/stories/{id} endpoint"
```

---

### Task 2.4: Update Story Endpoint

**Files:**
- Modify: `main.py`
- Modify: `tests/test_story_api.py`

- [ ] **Step 1: Write test**

Append to `tests/test_story_api.py`:

```python
def test_update_story(client):
    create_resp = client.post("/api/stories", json={"title": "Original"})
    story = create_resp.json()
    story["title"] = "Updated"
    story["theme"] = "fantasy"

    response = client.put(f"/api/stories/{story['id']}", json=story)
    assert response.status_code == 200
    assert response.json()["title"] == "Updated"
    assert response.json()["theme"] == "fantasy"

    # Verify persisted
    get_resp = client.get(f"/api/stories/{story['id']}")
    assert get_resp.json()["title"] == "Updated"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_story_api.py::test_update_story -v`
Expected: FAIL with 405

- [ ] **Step 3: Implement update story endpoint**

Add to `main.py`:

```python
@app.put("/api/stories/{story_id}")
async def update_story(story_id: str, story: Story) -> Story:
    story_path = STORIES_DIR / f"{story_id}.json"
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")
    with open(story_path, "w") as f:
        json.dump(story.model_dump(), f, indent=2)
    return story
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_story_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_story_api.py
git commit -m "feat: add PUT /api/stories/{id} endpoint"
```

---

### Task 2.5: Delete Story Endpoint

**Files:**
- Modify: `main.py`
- Modify: `tests/test_story_api.py`

- [ ] **Step 1: Write tests**

Append to `tests/test_story_api.py`:

```python
def test_delete_story(client):
    create_resp = client.post("/api/stories", json={"title": "To Delete"})
    story_id = create_resp.json()["id"]

    response = client.delete(f"/api/stories/{story_id}")
    assert response.status_code == 200

    # Verify gone
    get_resp = client.get(f"/api/stories/{story_id}")
    assert get_resp.status_code == 404


def test_delete_story_clears_active_session(client, tmp_path):
    import main
    create_resp = client.post("/api/stories", json={"title": "Active"})
    story_id = create_resp.json()["id"]

    # Create a state file for this story
    state = {"story_id": story_id, "status": "running"}
    with open(main.STATE_FILE, "w") as f:
        json.dump(state, f)

    client.delete(f"/api/stories/{story_id}")

    # State file should be cleared
    assert not main.STATE_FILE.exists() or main.STATE_FILE.read_text() == "{}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_story_api.py::test_delete_story -v`
Expected: FAIL with 405

- [ ] **Step 3: Implement delete story endpoint**

Add to `main.py`:

```python
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
                    with open(STATE_FILE, "w") as f:
                        f.write("{}")
            except json.JSONDecodeError:
                pass

    story_path.unlink()
    return {"status": "deleted"}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_story_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_story_api.py
git commit -m "feat: add DELETE /api/stories/{id} endpoint"
```

---

## Chunk 3: State Engine

### Task 3.1: Variable Injection

**Files:**
- Modify: `main.py`
- Create: `tests/test_state_engine.py`

- [ ] **Step 1: Write test for variable injection**

```python
# tests/test_state_engine.py
import pytest


def test_inject_variables_basic():
    from main import inject_variables
    fields = {"name": "Bob", "job": "wizard"}
    text = "{name} is a {job}."
    result = inject_variables(text, fields)
    assert result == "Bob is a wizard."


def test_inject_variables_missing_key():
    from main import inject_variables
    fields = {"name": "Bob"}
    text = "{name} has {unknown}."
    result = inject_variables(text, fields)
    assert result == "Bob has {unknown}."


def test_inject_variables_empty_fields():
    from main import inject_variables
    text = "{name} is here."
    result = inject_variables(text, {})
    assert result == "{name} is here."


def test_inject_variables_none_fields():
    from main import inject_variables
    text = "{name} is here."
    result = inject_variables(text, None)
    assert result == "{name} is here."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_engine.py::test_inject_variables_basic -v`
Expected: FAIL with "cannot import name 'inject_variables'"

- [ ] **Step 3: Implement inject_variables**

Add to `main.py` after models:

```python
import re


def inject_variables(text: str, fields: dict[str, str] | None) -> str:
    """Replace {key} placeholders with values from fields dict."""
    if not fields:
        return text

    def replace(match):
        key = match.group(1)
        return fields.get(key, match.group(0))

    return re.sub(r"\{(\w+)\}", replace, text)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_state_engine.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_state_engine.py
git commit -m "feat: add variable injection for mad libs"
```

---

### Task 3.2: Condition Evaluation

**Files:**
- Modify: `main.py`
- Modify: `tests/test_state_engine.py`

- [ ] **Step 1: Write tests for condition evaluation**

Append to `tests/test_state_engine.py`:

```python
def test_evaluate_condition_hp_lte():
    from main import evaluate_condition, Condition, ConditionType, GameState, SessionStatus
    state = GameState(story_id="test", current_scene_id="s1", hp=1)
    cond = Condition(type=ConditionType.HP, op="lte", value=1)
    assert evaluate_condition(cond, state) is True

    state.hp = 2
    assert evaluate_condition(cond, state) is False


def test_evaluate_condition_hp_gte():
    from main import evaluate_condition, Condition, ConditionType, GameState
    state = GameState(story_id="test", current_scene_id="s1", hp=3)
    cond = Condition(type=ConditionType.HP, op="gte", value=2)
    assert evaluate_condition(cond, state) is True


def test_evaluate_condition_items_count():
    from main import evaluate_condition, Condition, ConditionType, GameState
    state = GameState(story_id="test", current_scene_id="s1", hp=3, items=["sword", "shield"])
    cond = Condition(type=ConditionType.ITEMS, op="gte", value=2)
    assert evaluate_condition(cond, state) is True

    cond = Condition(type=ConditionType.ITEMS, op="gte", value=3)
    assert evaluate_condition(cond, state) is False


def test_evaluate_condition_level():
    from main import evaluate_condition, Condition, ConditionType, GameState
    state = GameState(story_id="test", current_scene_id="s1", hp=3, level=2)
    cond = Condition(type=ConditionType.LEVEL, op="eq", value=2)
    assert evaluate_condition(cond, state) is True


def test_evaluate_condition_scene_outcome():
    from main import evaluate_condition, Condition, ConditionType, GameState, HistoryEntry, ChoiceKind
    state = GameState(
        story_id="test",
        current_scene_id="s2",
        hp=3,
        history=[HistoryEntry(scene_id="s1", outcome=ChoiceKind.ITEM, choice_index=1, item_name="key")]
    )
    cond = Condition(type=ConditionType.SCENE_OUTCOME, scene_id="s1", outcome="item")
    assert evaluate_condition(cond, state) is True

    cond = Condition(type=ConditionType.SCENE_OUTCOME, scene_id="s1", outcome="damage")
    assert evaluate_condition(cond, state) is False


def test_evaluate_condition_scene_not_played():
    from main import evaluate_condition, Condition, ConditionType, GameState
    state = GameState(story_id="test", current_scene_id="s1", hp=3)
    cond = Condition(type=ConditionType.SCENE_OUTCOME, scene_id="s1", outcome="item")
    assert evaluate_condition(cond, state) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_engine.py::test_evaluate_condition_hp_lte -v`
Expected: FAIL with "cannot import name 'evaluate_condition'"

- [ ] **Step 3: Implement evaluate_condition**

Add to `main.py`:

```python
def evaluate_condition(condition: Condition, state: GameState) -> bool:
    """Evaluate a condition against current game state."""
    if condition.type == ConditionType.SCENE_OUTCOME:
        for entry in state.history:
            if entry.scene_id == condition.scene_id:
                return entry.outcome.value == condition.outcome
        return False

    # Get the value to compare
    if condition.type == ConditionType.HP:
        actual = state.hp
    elif condition.type == ConditionType.ITEMS:
        actual = len(state.items)
    elif condition.type == ConditionType.LEVEL:
        actual = state.level
    else:
        return False

    # Compare
    if condition.op == "lte":
        return actual <= condition.value
    elif condition.op == "gte":
        return actual >= condition.value
    elif condition.op == "eq":
        return actual == condition.value
    return False
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_state_engine.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_state_engine.py
git commit -m "feat: add condition evaluation for hp, items, level, scene_outcome"
```

---

### Task 3.3: Resolve Scene Text

**Files:**
- Modify: `main.py`
- Modify: `tests/test_state_engine.py`

- [ ] **Step 1: Write test for resolve_scene_text**

Append to `tests/test_state_engine.py`:

```python
def test_resolve_scene_text():
    from main import (
        resolve_scene_text, Scene, Choice, ChoiceKind, ConditionalText,
        Condition, ConditionType, GameState, Character
    )
    scene = Scene(
        id="s1",
        title="Test",
        base_text="{name} enters the room.",
        choices=[Choice(kind=ChoiceKind.DAMAGE, text="Fight", amount=1)],
        conditional_text=[
            ConditionalText(
                condition=Condition(type=ConditionType.HP, op="lte", value=1),
                text="You look injured."
            )
        ]
    )
    state = GameState(
        story_id="test",
        current_scene_id="s1",
        hp=1,
        character=Character(name="Bob", description="Bob desc", fields={"name": "Bob"})
    )

    result = resolve_scene_text(scene, state)
    assert result == "Bob enters the room. You look injured."


def test_resolve_scene_text_no_conditions_match():
    from main import (
        resolve_scene_text, Scene, Choice, ChoiceKind, ConditionalText,
        Condition, ConditionType, GameState
    )
    scene = Scene(
        id="s1",
        title="Test",
        base_text="You enter.",
        choices=[Choice(kind=ChoiceKind.DAMAGE, text="Fight", amount=1)],
        conditional_text=[
            ConditionalText(
                condition=Condition(type=ConditionType.HP, op="lte", value=1),
                text="You look injured."
            )
        ]
    )
    state = GameState(story_id="test", current_scene_id="s1", hp=3)

    result = resolve_scene_text(scene, state)
    assert result == "You enter."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_engine.py::test_resolve_scene_text -v`
Expected: FAIL with "cannot import name 'resolve_scene_text'"

- [ ] **Step 3: Implement resolve_scene_text**

Add to `main.py`:

```python
def resolve_scene_text(scene: Scene, state: GameState) -> str:
    """Build full scene text with conditionals and variable injection."""
    fields = state.character.fields if state.character else None

    # Start with base text
    text = inject_variables(scene.base_text, fields)

    # Append matching conditional text
    for ct in scene.conditional_text:
        if evaluate_condition(ct.condition, state):
            injected = inject_variables(ct.text, fields)
            text += " " + injected

    return text
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_state_engine.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_state_engine.py
git commit -m "feat: add resolve_scene_text with conditionals and variables"
```

---

### Task 3.4: Replay History

**Files:**
- Modify: `main.py`
- Modify: `tests/test_state_engine.py`

- [ ] **Step 1: Write test for replay_history**

Append to `tests/test_state_engine.py`:

```python
def test_replay_history():
    from main import replay_history, HistoryEntry, ChoiceKind

    history = [
        HistoryEntry(scene_id="s1", outcome=ChoiceKind.DAMAGE, choice_index=0, damage_amount=1),
        HistoryEntry(scene_id="s2", outcome=ChoiceKind.ITEM, choice_index=1, item_name="sword"),
        HistoryEntry(scene_id="s3", outcome=ChoiceKind.LEVEL, choice_index=2),
    ]

    hp, level, items = replay_history(history, starting_hp=3)
    assert hp == 2  # 3 - 1 damage
    assert level == 2  # 1 + 1 level up
    assert items == ["sword"]


def test_replay_history_empty():
    from main import replay_history
    hp, level, items = replay_history([], starting_hp=3)
    assert hp == 3
    assert level == 1
    assert items == []


def test_replay_history_multiple_items():
    from main import replay_history, HistoryEntry, ChoiceKind
    history = [
        HistoryEntry(scene_id="s1", outcome=ChoiceKind.ITEM, choice_index=1, item_name="sword"),
        HistoryEntry(scene_id="s2", outcome=ChoiceKind.ITEM, choice_index=1, item_name="shield"),
    ]
    hp, level, items = replay_history(history, starting_hp=3)
    assert items == ["sword", "shield"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_engine.py::test_replay_history -v`
Expected: FAIL with "cannot import name 'replay_history'"

- [ ] **Step 3: Implement replay_history**

Add to `main.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_state_engine.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_state_engine.py
git commit -m "feat: add replay_history for back button support"
```

---

## Chunk 4: Session State API

### Task 4.1: Get State Endpoint

**Files:**
- Modify: `main.py`
- Create: `tests/test_state_api.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_state_api.py
import pytest
from fastapi.testclient import TestClient
import json


@pytest.fixture
def client(tmp_path, monkeypatch):
    import main
    monkeypatch.setattr(main, "STORIES_DIR", tmp_path / "stories")
    monkeypatch.setattr(main, "STATE_FILE", tmp_path / "state.json")
    main.STORIES_DIR.mkdir(exist_ok=True)
    return TestClient(main.app)


def test_get_state_no_session(client):
    response = client.get("/api/state")
    assert response.status_code == 200
    assert response.json() == {"state": None, "resolved": None}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_api.py::test_get_state_no_session -v`
Expected: FAIL with 404

- [ ] **Step 3: Implement get state endpoint**

Add to `main.py`:

```python
def load_state() -> GameState | None:
    """Load current game state from disk."""
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


def save_state(state: GameState | None):
    """Save game state to disk."""
    if state is None:
        with open(STATE_FILE, "w") as f:
            f.write("{}")
    else:
        with open(STATE_FILE, "w") as f:
            json.dump(state.model_dump(), f, indent=2)


def get_current_scene(story: Story, scene_id: str) -> Scene | None:
    """Find scene by ID in story."""
    for scene in story.scenes:
        if scene.id == scene_id:
            return scene
    return None


def build_resolved(state: GameState | None) -> dict | None:
    """Build resolved text for SSE payload."""
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

    return {
        "scene_text": scene_text,
        "character_description": char_desc
    }


@app.get("/api/state")
async def get_state():
    state = load_state()
    resolved = build_resolved(state)
    return {
        "state": state.model_dump() if state else None,
        "resolved": resolved
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_state_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_state_api.py
git commit -m "feat: add GET /api/state endpoint"
```

---

### Task 4.2: Start Session Endpoint

**Files:**
- Modify: `main.py`
- Modify: `tests/test_state_api.py`

- [ ] **Step 1: Write tests**

Append to `tests/test_state_api.py`:

```python
def create_test_story(client):
    """Helper to create a story with scenes."""
    resp = client.post("/api/stories", json={"title": "Test"})
    story = resp.json()
    story["scenes"] = [
        {
            "id": "scene_1",
            "title": "First",
            "base_text": "You begin.",
            "choices": [
                {"kind": "damage", "text": "Fight", "amount": 1},
                {"kind": "item", "text": "Search", "item_name": "Key", "amount": 1},
                {"kind": "level", "text": "Study", "amount": 1}
            ],
            "conditional_text": []
        }
    ]
    story["madlib_template"] = {"prompt": "{name} is a hero.", "fields": [{"key": "name", "label": "Name"}]}
    client.put(f"/api/stories/{story['id']}", json=story)
    return story


def test_start_session(client):
    story = create_test_story(client)
    response = client.post("/api/state/start", json={"story_id": story["id"]})
    assert response.status_code == 200

    data = response.json()
    assert data["state"]["story_id"] == story["id"]
    assert data["state"]["status"] == "madlib_in_progress"
    assert data["state"]["hp"] == 3
    assert data["state"]["current_scene_id"] == "scene_1"


def test_start_session_no_madlibs(client):
    resp = client.post("/api/stories", json={"title": "No Madlibs"})
    story = resp.json()
    story["scenes"] = [
        {"id": "s1", "title": "Start", "base_text": "Go.", "choices": [
            {"kind": "damage", "text": "X", "amount": 1},
            {"kind": "item", "text": "Y", "item_name": "A", "amount": 1},
            {"kind": "level", "text": "Z", "amount": 1}
        ], "conditional_text": []}
    ]
    story["madlib_template"] = {"prompt": "", "fields": []}
    client.put(f"/api/stories/{story['id']}", json=story)

    response = client.post("/api/state/start", json={"story_id": story["id"]})
    assert response.json()["state"]["status"] == "running"
    assert response.json()["state"]["character"] is None


def test_start_session_story_not_found(client):
    response = client.post("/api/state/start", json={"story_id": "nonexistent"})
    assert response.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_api.py::test_start_session -v`
Expected: FAIL with 404

- [ ] **Step 3: Implement start endpoint**

Add to `main.py`:

```python
class StartRequest(BaseModel):
    story_id: str


@app.post("/api/state/start")
async def start_session(request: StartRequest):
    story_path = STORIES_DIR / f"{request.story_id}.json"
    if not story_path.exists():
        raise HTTPException(status_code=404, detail="Story not found")

    with open(story_path) as f:
        story = Story(**json.load(f))

    if not story.scenes:
        raise HTTPException(status_code=400, detail="Story has no scenes")

    # Determine initial status
    has_madlibs = len(story.madlib_template.fields) > 0
    initial_status = SessionStatus.MADLIB_IN_PROGRESS if has_madlibs else SessionStatus.RUNNING

    state = GameState(
        story_id=request.story_id,
        status=initial_status,
        current_scene_id=story.scenes[0].id,
        hp=story.settings.starting_hp,
        character=None if has_madlibs else None
    )

    save_state(state)
    await broadcast_state()

    resolved = build_resolved(state)
    return {"state": state.model_dump(), "resolved": resolved}
```

- [ ] **Step 4: Add broadcast_state stub**

Add to `main.py` (we'll implement SSE fully later):

```python
from contextlib import asynccontextmanager

# SSE connections (in-memory)
sse_connections: set = set()


async def broadcast_state():
    """Broadcast current state to all SSE clients."""
    state = load_state()
    resolved = build_resolved(state)
    payload = {
        "type": "state",
        "state": state.model_dump() if state else None,
        "resolved": resolved,
        "connected_count": len(sse_connections)
    }
    message = f"data: {json.dumps(payload)}\n\n"
    dead = set()
    for queue in sse_connections:
        try:
            await queue.put(message)
        except Exception:
            dead.add(queue)
    sse_connections -= dead
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_state_api.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add main.py tests/test_state_api.py
git commit -m "feat: add POST /api/state/start endpoint"
```

---

### Task 4.3: Mad Libs Endpoint

**Files:**
- Modify: `main.py`
- Modify: `tests/test_state_api.py`

- [ ] **Step 1: Write tests**

Append to `tests/test_state_api.py`:

```python
def test_madlib_submit(client):
    story = create_test_story(client)
    client.post("/api/state/start", json={"story_id": story["id"]})

    response = client.post("/api/state/madlib", json={"key": "name", "value": "Bob"})
    assert response.status_code == 200

    data = response.json()
    # Only one field, so should complete mad libs
    assert data["state"]["status"] == "running"
    assert data["state"]["character"]["name"] == "Bob"
    assert data["state"]["character"]["fields"]["name"] == "Bob"


def test_madlib_wrong_status(client):
    story = create_test_story(client)
    # Start with no madlibs story
    resp = client.post("/api/stories", json={"title": "No ML"})
    s = resp.json()
    s["scenes"] = [{"id": "s1", "title": "X", "base_text": "Y", "choices": [
        {"kind": "damage", "text": "A", "amount": 1},
        {"kind": "item", "text": "B", "item_name": "C", "amount": 1},
        {"kind": "level", "text": "D", "amount": 1}
    ], "conditional_text": []}]
    s["madlib_template"] = {"prompt": "", "fields": []}
    client.put(f"/api/stories/{s['id']}", json=s)
    client.post("/api/state/start", json={"story_id": s["id"]})

    response = client.post("/api/state/madlib", json={"key": "name", "value": "Bob"})
    assert response.status_code == 409
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_api.py::test_madlib_submit -v`
Expected: FAIL with 404

- [ ] **Step 3: Implement madlib endpoint**

Add to `main.py`:

```python
class MadlibRequest(BaseModel):
    key: str
    value: str


@app.post("/api/state/madlib")
async def submit_madlib(request: MadlibRequest):
    state = load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")

    if state.status != SessionStatus.MADLIB_IN_PROGRESS:
        raise HTTPException(status_code=409, detail="Not in mad libs phase")

    # Load story to get template
    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))

    # Record answer
    state.madlib_answers[request.key] = request.value
    state.madlib_step += 1

    # Check if all fields answered
    if state.madlib_step >= len(story.madlib_template.fields):
        # Build character
        fields = state.madlib_answers
        description = inject_variables(story.madlib_template.prompt, fields)
        name = fields.get("name", "Unknown Hero")

        state.character = Character(
            name=name,
            description=description,
            fields=fields
        )
        state.status = SessionStatus.RUNNING

    save_state(state)
    await broadcast_state()

    resolved = build_resolved(state)
    return {"state": state.model_dump(), "resolved": resolved}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_state_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_state_api.py
git commit -m "feat: add POST /api/state/madlib endpoint"
```

---

### Task 4.4: Choice Endpoint

**Files:**
- Modify: `main.py`
- Modify: `tests/test_state_api.py`

- [ ] **Step 1: Write tests**

Append to `tests/test_state_api.py`:

```python
def start_running_session(client):
    """Helper to create story and start in running state."""
    resp = client.post("/api/stories", json={"title": "Run Test"})
    story = resp.json()
    story["scenes"] = [
        {"id": "s1", "title": "Scene 1", "base_text": "First.", "choices": [
            {"kind": "damage", "text": "Fight", "amount": 1},
            {"kind": "item", "text": "Grab", "item_name": "Sword", "amount": 1},
            {"kind": "level", "text": "Learn", "amount": 1}
        ], "conditional_text": []},
        {"id": "s2", "title": "Scene 2", "base_text": "Second.", "choices": [
            {"kind": "damage", "text": "A", "amount": 1},
            {"kind": "item", "text": "B", "item_name": "Shield", "amount": 1},
            {"kind": "level", "text": "C", "amount": 1}
        ], "conditional_text": []}
    ]
    story["madlib_template"] = {"prompt": "", "fields": []}
    client.put(f"/api/stories/{story['id']}", json=story)
    client.post("/api/state/start", json={"story_id": story["id"]})
    return story


def test_choice_damage(client):
    start_running_session(client)
    response = client.post("/api/state/choice", json={"choice_index": 0})
    assert response.status_code == 200

    data = response.json()
    assert data["state"]["hp"] == 2  # 3 - 1
    assert data["state"]["current_scene_id"] == "s2"
    assert len(data["state"]["history"]) == 1
    assert data["state"]["history"][0]["outcome"] == "damage"


def test_choice_item(client):
    start_running_session(client)
    response = client.post("/api/state/choice", json={"choice_index": 1})
    assert response.status_code == 200

    data = response.json()
    assert data["state"]["items"] == ["Sword"]
    assert data["state"]["current_scene_id"] == "s2"


def test_choice_level(client):
    start_running_session(client)
    response = client.post("/api/state/choice", json={"choice_index": 2})
    assert response.status_code == 200

    data = response.json()
    assert data["state"]["level"] == 2


def test_choice_hp_zero_defeat(client):
    resp = client.post("/api/stories", json={"title": "Death Test"})
    story = resp.json()
    story["settings"]["starting_hp"] = 1
    story["scenes"] = [{"id": "s1", "title": "X", "base_text": "Y", "choices": [
        {"kind": "damage", "text": "Die", "amount": 1},
        {"kind": "item", "text": "B", "item_name": "C", "amount": 1},
        {"kind": "level", "text": "D", "amount": 1}
    ], "conditional_text": []}]
    story["madlib_template"] = {"prompt": "", "fields": []}
    client.put(f"/api/stories/{story['id']}", json=story)
    client.post("/api/state/start", json={"story_id": story["id"]})

    response = client.post("/api/state/choice", json={"choice_index": 0})
    data = response.json()
    assert data["state"]["hp"] == 0
    assert data["state"]["status"] == "game_over"
    assert data["state"]["outcome"] == "defeat"


def test_choice_last_scene_game_over(client):
    resp = client.post("/api/stories", json={"title": "Finale"})
    story = resp.json()
    story["scenes"] = [{"id": "s1", "title": "Final", "base_text": "End.", "choices": [
        {"kind": "level", "text": "Win", "amount": 1},
        {"kind": "item", "text": "B", "item_name": "C", "amount": 1},
        {"kind": "damage", "text": "D", "amount": 1}
    ], "conditional_text": []}]
    story["madlib_template"] = {"prompt": "", "fields": []}
    client.put(f"/api/stories/{story['id']}", json=story)
    client.post("/api/state/start", json={"story_id": story["id"]})

    response = client.post("/api/state/choice", json={"choice_index": 0})
    data = response.json()
    assert data["state"]["status"] == "game_over"
    assert data["state"]["outcome"] is None  # Awaiting dice roll


def test_choice_game_over_409(client):
    resp = client.post("/api/stories", json={"title": "Over"})
    story = resp.json()
    story["scenes"] = [{"id": "s1", "title": "X", "base_text": "Y", "choices": [
        {"kind": "level", "text": "A", "amount": 1},
        {"kind": "item", "text": "B", "item_name": "C", "amount": 1},
        {"kind": "damage", "text": "D", "amount": 1}
    ], "conditional_text": []}]
    story["madlib_template"] = {"prompt": "", "fields": []}
    client.put(f"/api/stories/{story['id']}", json=story)
    client.post("/api/state/start", json={"story_id": story["id"]})
    client.post("/api/state/choice", json={"choice_index": 0})  # game_over

    response = client.post("/api/state/choice", json={"choice_index": 0})
    assert response.status_code == 409
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_api.py::test_choice_damage -v`
Expected: FAIL with 404

- [ ] **Step 3: Implement choice endpoint**

Add to `main.py`:

```python
class ChoiceRequest(BaseModel):
    choice_index: int


@app.post("/api/state/choice")
async def make_choice(request: ChoiceRequest):
    state = load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")

    if state.status == SessionStatus.GAME_OVER:
        raise HTTPException(status_code=409, detail="Game is over")

    if state.status != SessionStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Not in running state")

    # Load story
    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))

    # Find current scene
    scene = get_current_scene(story, state.current_scene_id)
    if scene is None:
        raise HTTPException(status_code=500, detail="Scene not found")

    if request.choice_index < 0 or request.choice_index >= len(scene.choices):
        raise HTTPException(status_code=400, detail="Invalid choice index")

    choice = scene.choices[request.choice_index]

    # Create history entry
    entry = HistoryEntry(
        scene_id=scene.id,
        outcome=choice.kind,
        choice_index=request.choice_index,
        item_name=choice.item_name if choice.kind == ChoiceKind.ITEM else None,
        damage_amount=choice.amount if choice.kind == ChoiceKind.DAMAGE else 1
    )
    state.history.append(entry)

    # Apply outcome
    if choice.kind == ChoiceKind.DAMAGE:
        state.hp -= choice.amount
    elif choice.kind == ChoiceKind.ITEM:
        if choice.item_name:
            state.items.append(choice.item_name)
    elif choice.kind == ChoiceKind.LEVEL:
        state.level += 1

    # Check for HP defeat
    if state.hp <= 0:
        state.status = SessionStatus.GAME_OVER
        state.outcome = "defeat"
    else:
        # Check if last scene
        scene_ids = [s.id for s in story.scenes]
        current_idx = scene_ids.index(state.current_scene_id)
        if current_idx >= len(story.scenes) - 1:
            # Last scene - game over, awaiting dice
            state.status = SessionStatus.GAME_OVER
            state.outcome = None
        else:
            # Advance to next scene
            state.current_scene_id = story.scenes[current_idx + 1].id

    save_state(state)
    await broadcast_state()

    resolved = build_resolved(state)
    return {"state": state.model_dump(), "resolved": resolved}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_state_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_state_api.py
git commit -m "feat: add POST /api/state/choice endpoint"
```

---

### Task 4.5: Back Button Endpoint

**Files:**
- Modify: `main.py`
- Modify: `tests/test_state_api.py`

- [ ] **Step 1: Write tests**

Append to `tests/test_state_api.py`:

```python
def test_back_button(client):
    start_running_session(client)
    client.post("/api/state/choice", json={"choice_index": 0})  # damage, go to s2

    response = client.post("/api/state/back")
    assert response.status_code == 200

    data = response.json()
    assert data["state"]["current_scene_id"] == "s1"
    assert data["state"]["hp"] == 3  # restored
    assert len(data["state"]["history"]) == 0


def test_back_from_game_over(client):
    resp = client.post("/api/stories", json={"title": "Back"})
    story = resp.json()
    story["scenes"] = [{"id": "s1", "title": "X", "base_text": "Y", "choices": [
        {"kind": "level", "text": "A", "amount": 1},
        {"kind": "item", "text": "B", "item_name": "C", "amount": 1},
        {"kind": "damage", "text": "D", "amount": 1}
    ], "conditional_text": []}]
    story["madlib_template"] = {"prompt": "", "fields": []}
    client.put(f"/api/stories/{story['id']}", json=story)
    client.post("/api/state/start", json={"story_id": story["id"]})
    client.post("/api/state/choice", json={"choice_index": 0})  # game_over

    response = client.post("/api/state/back")
    data = response.json()
    assert data["state"]["status"] == "running"
    assert data["state"]["current_scene_id"] == "s1"


def test_back_empty_history_noop(client):
    start_running_session(client)
    response = client.post("/api/state/back")
    assert response.status_code == 200
    # Should be no-op, still on scene 1


def test_back_madlib_noop(client):
    story = create_test_story(client)
    client.post("/api/state/start", json={"story_id": story["id"]})

    response = client.post("/api/state/back")
    assert response.status_code == 200
    data = response.json()
    assert data["state"]["status"] == "madlib_in_progress"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_api.py::test_back_button -v`
Expected: FAIL with 404

- [ ] **Step 3: Implement back endpoint**

Add to `main.py`:

```python
@app.post("/api/state/back")
async def go_back():
    state = load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")

    # No-op during mad libs
    if state.status == SessionStatus.MADLIB_IN_PROGRESS:
        resolved = build_resolved(state)
        return {"state": state.model_dump(), "resolved": resolved}

    # No-op if history empty
    if not state.history:
        resolved = build_resolved(state)
        return {"state": state.model_dump(), "resolved": resolved}

    # Load story for starting_hp
    story_path = STORIES_DIR / f"{state.story_id}.json"
    with open(story_path) as f:
        story = Story(**json.load(f))

    # Pop last entry
    popped = state.history.pop()

    # Set current scene to the popped scene
    state.current_scene_id = popped.scene_id

    # Replay remaining history
    state.hp, state.level, state.items = replay_history(
        state.history,
        story.settings.starting_hp
    )

    # Return to running if was game_over
    if state.status == SessionStatus.GAME_OVER:
        state.status = SessionStatus.RUNNING
        state.outcome = None

    save_state(state)
    await broadcast_state()

    resolved = build_resolved(state)
    return {"state": state.model_dump(), "resolved": resolved}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_state_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_state_api.py
git commit -m "feat: add POST /api/state/back endpoint"
```

---

### Task 4.6: Finish and Restart Endpoints

**Files:**
- Modify: `main.py`
- Modify: `tests/test_state_api.py`

- [ ] **Step 1: Write tests**

Append to `tests/test_state_api.py`:

```python
def test_finish_victory(client):
    resp = client.post("/api/stories", json={"title": "Fin"})
    story = resp.json()
    story["scenes"] = [{"id": "s1", "title": "X", "base_text": "Y", "choices": [
        {"kind": "level", "text": "A", "amount": 1},
        {"kind": "item", "text": "B", "item_name": "C", "amount": 1},
        {"kind": "damage", "text": "D", "amount": 1}
    ], "conditional_text": []}]
    story["madlib_template"] = {"prompt": "", "fields": []}
    client.put(f"/api/stories/{story['id']}", json=story)
    client.post("/api/state/start", json={"story_id": story["id"]})
    client.post("/api/state/choice", json={"choice_index": 0})

    response = client.post("/api/state/finish", json={"outcome": "victory"})
    assert response.status_code == 200
    assert response.json()["state"]["outcome"] == "victory"


def test_finish_defeat(client):
    resp = client.post("/api/stories", json={"title": "Fin2"})
    story = resp.json()
    story["scenes"] = [{"id": "s1", "title": "X", "base_text": "Y", "choices": [
        {"kind": "level", "text": "A", "amount": 1},
        {"kind": "item", "text": "B", "item_name": "C", "amount": 1},
        {"kind": "damage", "text": "D", "amount": 1}
    ], "conditional_text": []}]
    story["madlib_template"] = {"prompt": "", "fields": []}
    client.put(f"/api/stories/{story['id']}", json=story)
    client.post("/api/state/start", json={"story_id": story["id"]})
    client.post("/api/state/choice", json={"choice_index": 0})

    response = client.post("/api/state/finish", json={"outcome": "defeat"})
    assert response.json()["state"]["outcome"] == "defeat"


def test_restart(client):
    start_running_session(client)
    client.post("/api/state/choice", json={"choice_index": 0})

    response = client.post("/api/state/restart")
    assert response.status_code == 200

    get_resp = client.get("/api/state")
    assert get_resp.json()["state"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_state_api.py::test_finish_victory -v`
Expected: FAIL with 404

- [ ] **Step 3: Implement finish and restart endpoints**

Add to `main.py`:

```python
class FinishRequest(BaseModel):
    outcome: Literal["victory", "defeat"]


@app.post("/api/state/finish")
async def finish_session(request: FinishRequest):
    state = load_state()
    if state is None:
        raise HTTPException(status_code=404, detail="No active session")

    if state.status != SessionStatus.GAME_OVER:
        raise HTTPException(status_code=409, detail="Game not over yet")

    state.outcome = request.outcome
    save_state(state)
    await broadcast_state()

    resolved = build_resolved(state)
    return {"state": state.model_dump(), "resolved": resolved}


@app.post("/api/state/restart")
async def restart_session():
    save_state(None)
    await broadcast_state()
    return {"state": None, "resolved": None}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_state_api.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_state_api.py
git commit -m "feat: add POST /api/state/finish and /api/state/restart endpoints"
```

---

## Chunk 5: SSE and Page Routes

### Task 5.1: SSE Endpoint

**Files:**
- Modify: `main.py`

- [ ] **Step 1: Implement SSE endpoint**

Add to `main.py`:

```python
from fastapi.responses import StreamingResponse
import asyncio


@app.get("/api/events")
async def sse_events():
    queue = asyncio.Queue()
    sse_connections.add(queue)

    async def event_generator():
        try:
            # Send initial state
            state = load_state()
            resolved = build_resolved(state)
            payload = {
                "type": "state",
                "state": state.model_dump() if state else None,
                "resolved": resolved,
                "connected_count": len(sse_connections)
            }
            yield f"data: {json.dumps(payload)}\n\n"

            # Send updates
            while True:
                message = await queue.get()
                yield message
        except asyncio.CancelledError:
            pass
        finally:
            sse_connections.discard(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
```

- [ ] **Step 2: Test manually**

Run: `python main.py` in one terminal
Run: `curl -N http://localhost:8000/api/events` in another
Expected: Receives JSON state payload

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "feat: add SSE endpoint for real-time updates"
```

---

### Task 5.2: Page Routes

**Files:**
- Modify: `main.py`

- [ ] **Step 1: Add page routes**

Add to `main.py` (after existing index route):

```python
@app.get("/editor")
async def editor():
    return FileResponse(STATIC_DIR / "pages" / "editor.html")


@app.get("/run")
async def run():
    return FileResponse(STATIC_DIR / "pages" / "run.html")


@app.get("/player")
async def player():
    return FileResponse(STATIC_DIR / "pages" / "player.html")
```

- [ ] **Step 2: Create placeholder HTML files**

Create `static/pages/editor.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Story Editor - J&B's RPG</title>
</head>
<body>
    <h1>Story Editor</h1>
</body>
</html>
```

Create `static/pages/run.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Run Story - J&B's RPG</title>
</head>
<body>
    <h1>Storyteller View</h1>
</body>
</html>
```

Create `static/pages/player.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Player View - J&B's RPG</title>
</head>
<body>
    <h1>Player View</h1>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add main.py static/pages/
git commit -m "feat: add page routes for editor, run, player"
```

---

## Chunk 6: Frontend Foundation

### Task 6.1: Base CSS

**Files:**
- Create: `static/css/base.css`

- [ ] **Step 1: Create base CSS with CSS custom properties**

```css
/* static/css/base.css */
:root {
    /* Base colors - overridden by themes */
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --text-primary: #eee;
    --text-secondary: #aaa;
    --accent: #0f9b8e;
    --accent-hover: #0db8a8;
    --danger: #e74c3c;
    --success: #27ae60;
    --warning: #f39c12;

    /* Spacing */
    --space-xs: 0.25rem;
    --space-sm: 0.5rem;
    --space-md: 1rem;
    --space-lg: 1.5rem;
    --space-xl: 2rem;

    /* Typography */
    --font-body: system-ui, -apple-system, sans-serif;
    --font-display: var(--font-body);
    --font-mono: ui-monospace, monospace;

    /* Borders */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
}

/* Light mode */
[data-mode="light"] {
    --bg-primary: #f5f5f5;
    --bg-secondary: #fff;
    --text-primary: #222;
    --text-secondary: #666;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: var(--font-body);
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    line-height: 1.5;
}

/* Common components */
.btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: none;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: white;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
}

.btn:hover {
    background: var(--accent-hover);
}

.btn--danger {
    background: var(--danger);
}

.btn--secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--text-secondary);
}

.card {
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
}

.input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--text-secondary);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 1rem;
}

.input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}

/* Layout */
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-lg);
}

.nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--text-secondary);
}

.nav__title {
    font-size: 1.25rem;
    font-weight: 600;
}

/* HP indicators base */
.hp-container {
    display: flex;
    gap: var(--space-sm);
}

.hp-indicator {
    width: 24px;
    height: 24px;
}

.hp-indicator--empty {
    opacity: 0.3;
}
```

- [ ] **Step 2: Commit**

```bash
git add static/css/base.css
git commit -m "feat: add base CSS with design tokens"
```

---

### Task 6.2: API Client

**Files:**
- Create: `static/js/api.js`

- [ ] **Step 1: Create API client**

```javascript
// static/js/api.js
const API = {
    async getStories() {
        const res = await fetch('/api/stories');
        return res.json();
    },

    async getStory(id) {
        const res = await fetch(`/api/stories/${id}`);
        if (!res.ok) throw new Error('Story not found');
        return res.json();
    },

    async createStory(title) {
        const res = await fetch('/api/stories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        return res.json();
    },

    async updateStory(id, story) {
        const res = await fetch(`/api/stories/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(story)
        });
        return res.json();
    },

    async deleteStory(id) {
        await fetch(`/api/stories/${id}`, { method: 'DELETE' });
    },

    async getState() {
        const res = await fetch('/api/state');
        return res.json();
    },

    async startSession(storyId) {
        const res = await fetch('/api/state/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ story_id: storyId })
        });
        return res.json();
    },

    async submitMadlib(key, value) {
        const res = await fetch('/api/state/madlib', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value })
        });
        return res.json();
    },

    async makeChoice(choiceIndex) {
        const res = await fetch('/api/state/choice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ choice_index: choiceIndex })
        });
        return res.json();
    },

    async goBack() {
        const res = await fetch('/api/state/back', { method: 'POST' });
        return res.json();
    },

    async finish(outcome) {
        const res = await fetch('/api/state/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome })
        });
        return res.json();
    },

    async restart() {
        const res = await fetch('/api/state/restart', { method: 'POST' });
        return res.json();
    }
};
```

- [ ] **Step 2: Commit**

```bash
git add static/js/api.js
git commit -m "feat: add API client for frontend"
```

---

### Task 6.3: SSE Client

**Files:**
- Create: `static/js/sse.js`

- [ ] **Step 1: Create SSE client with reconnection**

```javascript
// static/js/sse.js
class SSEClient {
    constructor(onStateUpdate) {
        this.onStateUpdate = onStateUpdate;
        this.eventSource = null;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
    }

    connect() {
        this.eventSource = new EventSource('/api/events');

        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'state') {
                    this.onStateUpdate(data);
                }
            } catch (e) {
                console.error('SSE parse error:', e);
            }
        };

        this.eventSource.onerror = () => {
            this.eventSource.close();
            console.log(`SSE reconnecting in ${this.reconnectDelay}ms...`);
            setTimeout(() => this.connect(), this.reconnectDelay);
            this.reconnectDelay = Math.min(
                this.reconnectDelay * 2,
                this.maxReconnectDelay
            );
        };

        this.eventSource.onopen = () => {
            this.reconnectDelay = 1000;
        };
    }

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add static/js/sse.js
git commit -m "feat: add SSE client with exponential backoff"
```

---

### Task 6.4: Theme Manager

**Files:**
- Create: `static/js/theme.js`

- [ ] **Step 1: Create theme manager**

```javascript
// static/js/theme.js
const ThemeManager = {
    init() {
        // Load saved mode
        const mode = localStorage.getItem('mode') || 'dark';
        document.documentElement.dataset.mode = mode;
    },

    toggleMode() {
        const current = document.documentElement.dataset.mode;
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.mode = next;
        localStorage.setItem('mode', next);
    },

    setTheme(themeName) {
        // Remove existing theme
        const existing = document.querySelector('link[data-theme]');
        if (existing) existing.remove();

        // Add new theme
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `/static/css/themes/${themeName}.css`;
        link.dataset.theme = themeName;
        document.head.appendChild(link);
    }
};

// Auto-init on load
document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
```

- [ ] **Step 2: Commit**

```bash
git add static/js/theme.js
git commit -m "feat: add theme manager for light/dark mode and themes"
```

---

## Chunk 7: Story Library Page

### Task 7.1: Library HTML and JS

**Files:**
- Modify: `static/pages/index.html`
- Create: `static/js/library.js`

- [ ] **Step 1: Create library HTML**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Story Library - J&B's RPG</title>
    <link rel="stylesheet" href="/static/css/base.css">
    <style>
        .story-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: var(--space-lg);
            margin-top: var(--space-lg);
        }
        .story-card {
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
        }
        .story-card__title {
            font-size: 1.25rem;
            font-weight: 600;
        }
        .story-card__meta {
            color: var(--text-secondary);
            font-size: 0.875rem;
        }
        .story-card__actions {
            display: flex;
            gap: var(--space-sm);
            margin-top: auto;
        }
        .theme-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: var(--radius-sm);
            font-size: 0.75rem;
            text-transform: uppercase;
        }
        .empty-state {
            text-align: center;
            padding: var(--space-xl);
            color: var(--text-secondary);
        }
    </style>
</head>
<body>
    <nav class="nav">
        <span class="nav__title">J&B's RPG</span>
        <div>
            <button class="btn btn--secondary" onclick="ThemeManager.toggleMode()">Toggle Mode</button>
        </div>
    </nav>

    <div class="container">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h1>Story Library</h1>
            <button class="btn" onclick="createNewStory()">New Story</button>
        </div>

        <div id="story-grid" class="story-grid"></div>
        <div id="empty-state" class="empty-state card" style="display: none;">
            <p>No stories yet. Create your first adventure!</p>
        </div>
    </div>

    <script src="/static/js/api.js"></script>
    <script src="/static/js/theme.js"></script>
    <script src="/static/js/library.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create library JS**

```javascript
// static/js/library.js
let stories = [];

async function loadStories() {
    stories = await API.getStories();
    render();
}

function render() {
    const grid = document.getElementById('story-grid');
    const empty = document.getElementById('empty-state');

    if (stories.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    grid.innerHTML = stories.map(story => `
        <div class="card story-card">
            <div class="story-card__title">${escapeHtml(story.title)}</div>
            <div class="story-card__meta">
                <span class="theme-badge">${story.theme}</span>
                ${story.scene_count} scene${story.scene_count !== 1 ? 's' : ''}
            </div>
            <div class="story-card__actions">
                <button class="btn" onclick="editStory('${story.id}')">Edit</button>
                <button class="btn" onclick="runStory('${story.id}')">Run</button>
                <button class="btn btn--danger" onclick="deleteStory('${story.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function createNewStory() {
    const title = prompt('Story title:');
    if (!title) return;

    const story = await API.createStory(title);
    window.location.href = `/editor?story=${story.id}`;
}

function editStory(id) {
    window.location.href = `/editor?story=${id}`;
}

function runStory(id) {
    window.location.href = `/run?story=${id}`;
}

async function deleteStory(id) {
    if (!confirm('Delete this story?')) return;
    await API.deleteStory(id);
    await loadStories();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

loadStories();
```

- [ ] **Step 3: Test manually**

Run: `python main.py`
Visit: http://localhost:8000/
Expected: Empty state shows, can create/edit/delete stories

- [ ] **Step 4: Commit**

```bash
git add static/pages/index.html static/js/library.js
git commit -m "feat: implement story library page"
```

---

## Chunk 8: Story Editor Page

### Task 8.1: Editor HTML Structure

**Files:**
- Modify: `static/pages/editor.html`

- [ ] **Step 1: Create editor HTML**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Story Editor - J&B's RPG</title>
    <link rel="stylesheet" href="/static/css/base.css">
    <style>
        .editor-layout {
            display: grid;
            grid-template-columns: 280px 1fr;
            min-height: calc(100vh - 60px);
        }
        .sidebar {
            background: var(--bg-secondary);
            padding: var(--space-md);
            border-right: 1px solid var(--text-secondary);
            overflow-y: auto;
        }
        .sidebar__section {
            margin-bottom: var(--space-lg);
        }
        .sidebar__title {
            font-weight: 600;
            margin-bottom: var(--space-sm);
            color: var(--text-secondary);
            text-transform: uppercase;
            font-size: 0.75rem;
        }
        .scene-list {
            list-style: none;
        }
        .scene-item {
            padding: var(--space-sm);
            margin-bottom: var(--space-xs);
            border-radius: var(--radius-sm);
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .scene-item:hover {
            background: var(--bg-primary);
        }
        .scene-item--active {
            background: var(--accent);
            color: white;
        }
        .scene-item__delete {
            opacity: 0;
            background: none;
            border: none;
            color: inherit;
            cursor: pointer;
        }
        .scene-item:hover .scene-item__delete {
            opacity: 1;
        }
        .main-panel {
            padding: var(--space-lg);
            overflow-y: auto;
        }
        .form-group {
            margin-bottom: var(--space-lg);
        }
        .form-group label {
            display: block;
            margin-bottom: var(--space-xs);
            font-weight: 500;
        }
        textarea.input {
            min-height: 120px;
            resize: vertical;
        }
        .choice-block {
            background: var(--bg-primary);
            padding: var(--space-md);
            border-radius: var(--radius-md);
            margin-bottom: var(--space-md);
        }
        .choice-block--damage { border-left: 4px solid var(--danger); }
        .choice-block--item { border-left: 4px solid var(--success); }
        .choice-block--level { border-left: 4px solid var(--warning); }
        .choice-header {
            display: flex;
            gap: var(--space-md);
            margin-bottom: var(--space-sm);
        }
        .conditional-row {
            display: grid;
            grid-template-columns: 150px 80px 80px 1fr auto;
            gap: var(--space-sm);
            margin-bottom: var(--space-sm);
            align-items: center;
        }
        .theme-picker {
            display: flex;
            gap: var(--space-sm);
            flex-wrap: wrap;
        }
        .theme-swatch {
            width: 60px;
            height: 40px;
            border-radius: var(--radius-sm);
            border: 2px solid transparent;
            cursor: pointer;
        }
        .theme-swatch--active {
            border-color: var(--accent);
        }
        .theme-swatch--cyberpunk { background: linear-gradient(135deg, #0ff, #f0f); }
        .theme-swatch--fantasy { background: linear-gradient(135deg, #d4a574, #8b4513); }
        .theme-swatch--deep_space { background: linear-gradient(135deg, #1a0a2e, #4a1a6b); }
        .theme-swatch--modern { background: linear-gradient(135deg, #667eea, #764ba2); }
        .theme-swatch--horror { background: linear-gradient(135deg, #2d0a0a, #8b0000); }
        .nav-link {
            display: block;
            padding: var(--space-sm);
            color: var(--text-primary);
            text-decoration: none;
            border-radius: var(--radius-sm);
        }
        .nav-link:hover {
            background: var(--bg-primary);
        }
        .actions {
            display: flex;
            gap: var(--space-sm);
            margin-top: var(--space-lg);
        }
    </style>
</head>
<body>
    <nav class="nav">
        <a href="/" class="nav__title">J&B's RPG</a>
        <div>
            <button class="btn btn--secondary" onclick="ThemeManager.toggleMode()">Toggle Mode</button>
        </div>
    </nav>

    <div class="editor-layout">
        <aside class="sidebar">
            <div class="sidebar__section">
                <div class="sidebar__title">Scenes</div>
                <ul id="scene-list" class="scene-list"></ul>
                <button class="btn" style="width: 100%; margin-top: var(--space-sm);" onclick="addScene()">Add Scene</button>
            </div>
            <div class="sidebar__section">
                <div class="sidebar__title">Setup</div>
                <a href="#" class="nav-link" onclick="showMadlibEditor(); return false;">Mad Libs Template</a>
                <a href="#" class="nav-link" onclick="showSettings(); return false;">Story Settings</a>
            </div>
        </aside>

        <main id="main-panel" class="main-panel">
            <p>Select a scene to edit, or create a new one.</p>
        </main>
    </div>

    <script src="/static/js/api.js"></script>
    <script src="/static/js/theme.js"></script>
    <script src="/static/js/editor.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add static/pages/editor.html
git commit -m "feat: add editor page HTML structure"
```

---

### Task 8.2: Editor JavaScript

**Files:**
- Create: `static/js/editor.js`

- [ ] **Step 1: Create editor.js (core functionality)**

```javascript
// static/js/editor.js
let story = null;
let currentView = null; // 'scene', 'madlib', 'settings'
let currentSceneId = null;

const params = new URLSearchParams(window.location.search);
const storyId = params.get('story');

async function loadStory() {
    if (!storyId) {
        alert('No story ID provided');
        window.location.href = '/';
        return;
    }
    story = await API.getStory(storyId);
    renderSidebar();
    if (story.scenes.length > 0) {
        selectScene(story.scenes[0].id);
    }
}

function renderSidebar() {
    const list = document.getElementById('scene-list');
    list.innerHTML = story.scenes.map((scene, i) => `
        <li class="scene-item ${scene.id === currentSceneId ? 'scene-item--active' : ''}"
            onclick="selectScene('${scene.id}')"
            draggable="true"
            data-id="${scene.id}">
            <span>${i + 1}. ${escapeHtml(scene.title || 'Untitled')}</span>
            <button class="scene-item__delete" onclick="deleteScene('${scene.id}', event)">×</button>
        </li>
    `).join('');
    setupDragDrop();
}

function selectScene(sceneId) {
    currentSceneId = sceneId;
    currentView = 'scene';
    renderSidebar();
    renderSceneEditor();
}

function renderSceneEditor() {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;

    const panel = document.getElementById('main-panel');
    panel.innerHTML = `
        <h2>Edit Scene</h2>

        <div class="form-group">
            <label>Scene Title</label>
            <input class="input" id="scene-title" value="${escapeHtml(scene.title)}" onchange="updateScene()">
        </div>

        <div class="form-group">
            <label>Scene Text</label>
            <textarea class="input" id="scene-text" onchange="updateScene()">${escapeHtml(scene.base_text)}</textarea>
            <details style="margin-top: var(--space-xs);">
                <summary style="cursor: pointer; color: var(--text-secondary);">Available variables</summary>
                <div style="padding: var(--space-sm); font-family: var(--font-mono); font-size: 0.875rem;">
                    ${story.madlib_template.fields.map(f => `<code onclick="insertVariable('scene-text', '${f.key}')" style="cursor: pointer; margin-right: var(--space-sm);">{${f.key}}</code>`).join('')}
                    ${story.madlib_template.fields.length === 0 ? '<em>No mad lib fields defined</em>' : ''}
                </div>
            </details>
        </div>

        <div class="form-group">
            <label>Conditional Text</label>
            <div id="conditionals">
                ${scene.conditional_text.map((ct, i) => renderConditionalRow(ct, i)).join('')}
            </div>
            <button class="btn btn--secondary" onclick="addConditional()">Add Condition</button>
        </div>

        <div class="form-group">
            <label>Choices</label>
            ${scene.choices.map((c, i) => renderChoiceBlock(c, i)).join('')}
        </div>

        <div class="actions">
            <button class="btn" onclick="saveStory()">Save Story</button>
        </div>
    `;
}

function renderChoiceBlock(choice, index) {
    const kinds = ['damage', 'item', 'level'];
    return `
        <div class="choice-block choice-block--${choice.kind}">
            <div class="choice-header">
                <select class="input" style="width: auto;" onchange="updateChoiceKind(${index}, this.value)">
                    ${kinds.map(k => `<option value="${k}" ${choice.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
                </select>
                ${choice.kind === 'item' ? `
                    <input class="input" style="width: 200px;" placeholder="Item name"
                           value="${escapeHtml(choice.item_name || '')}"
                           onchange="updateChoiceItem(${index}, this.value)">
                ` : ''}
            </div>
            <input class="input" placeholder="Choice text" value="${escapeHtml(choice.text)}"
                   onchange="updateChoiceText(${index}, this.value)">
        </div>
    `;
}

function renderConditionalRow(ct, index) {
    const cond = ct.condition;
    return `
        <div class="conditional-row">
            <select class="input" onchange="updateConditionType(${index}, this.value)">
                <option value="hp" ${cond.type === 'hp' ? 'selected' : ''}>HP</option>
                <option value="items" ${cond.type === 'items' ? 'selected' : ''}>Items</option>
                <option value="level" ${cond.type === 'level' ? 'selected' : ''}>Level</option>
                <option value="scene_outcome" ${cond.type === 'scene_outcome' ? 'selected' : ''}>Scene Outcome</option>
            </select>
            ${cond.type === 'scene_outcome' ? `
                <select class="input" onchange="updateConditionSceneId(${index}, this.value)">
                    ${story.scenes.map(s => `<option value="${s.id}" ${cond.scene_id === s.id ? 'selected' : ''}>${s.title || s.id}</option>`).join('')}
                </select>
                <select class="input" onchange="updateConditionOutcome(${index}, this.value)">
                    <option value="damage" ${cond.outcome === 'damage' ? 'selected' : ''}>damage</option>
                    <option value="item" ${cond.outcome === 'item' ? 'selected' : ''}>item</option>
                    <option value="level" ${cond.outcome === 'level' ? 'selected' : ''}>level</option>
                </select>
            ` : `
                <select class="input" onchange="updateConditionOp(${index}, this.value)">
                    <option value="lte" ${cond.op === 'lte' ? 'selected' : ''}>≤</option>
                    <option value="gte" ${cond.op === 'gte' ? 'selected' : ''}>≥</option>
                    <option value="eq" ${cond.op === 'eq' ? 'selected' : ''}>=</option>
                </select>
                <input class="input" type="number" value="${cond.value || 0}"
                       onchange="updateConditionValue(${index}, this.value)">
            `}
            <input class="input" placeholder="Text to show" value="${escapeHtml(ct.text)}"
                   onchange="updateConditionText(${index}, this.value)">
            <button class="btn btn--danger" onclick="removeConditional(${index})">×</button>
        </div>
    `;
}

function updateScene() {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    if (!scene) return;
    scene.title = document.getElementById('scene-title').value;
    scene.base_text = document.getElementById('scene-text').value;
    renderSidebar();
}

function updateChoiceKind(index, kind) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.choices[index].kind = kind;
    if (kind !== 'item') scene.choices[index].item_name = null;
    renderSceneEditor();
}

function updateChoiceText(index, text) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.choices[index].text = text;
}

function updateChoiceItem(index, name) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.choices[index].item_name = name;
}

function addConditional() {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.conditional_text.push({
        condition: { type: 'hp', op: 'lte', value: 1 },
        text: ''
    });
    renderSceneEditor();
}

function removeConditional(index) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.conditional_text.splice(index, 1);
    renderSceneEditor();
}

function updateConditionType(index, type) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    const ct = scene.conditional_text[index];
    ct.condition.type = type;
    if (type === 'scene_outcome') {
        ct.condition.op = null;
        ct.condition.value = null;
        ct.condition.scene_id = story.scenes[0]?.id || '';
        ct.condition.outcome = 'damage';
    } else {
        ct.condition.scene_id = null;
        ct.condition.outcome = null;
        ct.condition.op = 'lte';
        ct.condition.value = 1;
    }
    renderSceneEditor();
}

function updateConditionOp(index, op) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.conditional_text[index].condition.op = op;
}

function updateConditionValue(index, value) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.conditional_text[index].condition.value = parseInt(value);
}

function updateConditionSceneId(index, sceneId) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.conditional_text[index].condition.scene_id = sceneId;
}

function updateConditionOutcome(index, outcome) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.conditional_text[index].condition.outcome = outcome;
}

function updateConditionText(index, text) {
    const scene = story.scenes.find(s => s.id === currentSceneId);
    scene.conditional_text[index].text = text;
}

function addScene() {
    const id = 'scene_' + Date.now();
    story.scenes.push({
        id,
        title: 'New Scene',
        base_text: '',
        choices: [
            { kind: 'damage', text: 'Choice 1', amount: 1 },
            { kind: 'item', text: 'Choice 2', item_name: 'Item', amount: 1 },
            { kind: 'level', text: 'Choice 3', amount: 1 }
        ],
        conditional_text: []
    });
    renderSidebar();
    selectScene(id);
}

function deleteScene(id, event) {
    event.stopPropagation();
    if (!confirm('Delete this scene?')) return;
    story.scenes = story.scenes.filter(s => s.id !== id);
    if (currentSceneId === id) {
        currentSceneId = story.scenes[0]?.id || null;
    }
    renderSidebar();
    if (currentSceneId) renderSceneEditor();
    else document.getElementById('main-panel').innerHTML = '<p>No scenes. Add one to get started.</p>';
}

function showMadlibEditor() {
    currentView = 'madlib';
    const panel = document.getElementById('main-panel');
    panel.innerHTML = `
        <h2>Mad Libs Template</h2>

        <div class="form-group">
            <label>Template Text</label>
            <textarea class="input" id="madlib-prompt" onchange="updateMadlibPrompt()">${escapeHtml(story.madlib_template.prompt)}</textarea>
            <p style="color: var(--text-secondary); margin-top: var(--space-xs);">Use {key} to define placeholders.</p>
        </div>

        <div class="form-group">
            <label>Fields</label>
            <div id="madlib-fields">
                ${story.madlib_template.fields.map((f, i) => `
                    <div style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-sm);">
                        <input class="input" style="width: 120px;" value="${escapeHtml(f.key)}"
                               onchange="updateFieldKey(${i}, this.value)" readonly>
                        <input class="input" placeholder="Prompt for player" value="${escapeHtml(f.label)}"
                               onchange="updateFieldLabel(${i}, this.value)">
                    </div>
                `).join('')}
            </div>
            <p style="color: var(--text-secondary);">Fields are auto-detected from {key} placeholders in the template.</p>
        </div>

        <div class="actions">
            <button class="btn" onclick="saveStory()">Save Story</button>
        </div>
    `;
}

function updateMadlibPrompt() {
    story.madlib_template.prompt = document.getElementById('madlib-prompt').value;
    // Auto-detect fields
    const matches = story.madlib_template.prompt.match(/\{(\w+)\}/g) || [];
    const keys = [...new Set(matches.map(m => m.slice(1, -1)))];

    // Preserve existing labels where possible
    const oldFields = Object.fromEntries(story.madlib_template.fields.map(f => [f.key, f.label]));
    story.madlib_template.fields = keys.map(key => ({
        key,
        label: oldFields[key] || `Enter a ${key}`
    }));
    showMadlibEditor();
}

function updateFieldLabel(index, label) {
    story.madlib_template.fields[index].label = label;
}

function showSettings() {
    currentView = 'settings';
    const panel = document.getElementById('main-panel');
    panel.innerHTML = `
        <h2>Story Settings</h2>

        <div class="form-group">
            <label>Starting HP</label>
            <input class="input" type="number" id="starting-hp" min="1" max="10"
                   value="${story.settings.starting_hp}" onchange="updateStartingHp()">
        </div>

        <div class="form-group">
            <label>Theme</label>
            <div class="theme-picker">
                ${['cyberpunk', 'fantasy', 'deep_space', 'modern', 'horror'].map(t => `
                    <div class="theme-swatch theme-swatch--${t} ${story.theme === t ? 'theme-swatch--active' : ''}"
                         onclick="setTheme('${t}')" title="${t}"></div>
                `).join('')}
            </div>
        </div>

        <div class="actions">
            <button class="btn" onclick="saveStory()">Save Story</button>
        </div>
    `;
}

function updateStartingHp() {
    story.settings.starting_hp = parseInt(document.getElementById('starting-hp').value);
}

function setTheme(theme) {
    story.theme = theme;
    showSettings();
}

async function saveStory() {
    await API.updateStory(storyId, story);
    alert('Story saved!');
}

function insertVariable(textareaId, key) {
    const textarea = document.getElementById(textareaId);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.slice(0, start) + `{${key}}` + text.slice(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + key.length + 2;
    updateScene();
}

function setupDragDrop() {
    const items = document.querySelectorAll('.scene-item');
    items.forEach(item => {
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', item.dataset.id);
        });
        item.addEventListener('dragover', e => e.preventDefault());
        item.addEventListener('drop', e => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            const targetId = item.dataset.id;
            if (draggedId === targetId) return;

            const draggedIdx = story.scenes.findIndex(s => s.id === draggedId);
            const targetIdx = story.scenes.findIndex(s => s.id === targetId);
            const [dragged] = story.scenes.splice(draggedIdx, 1);
            story.scenes.splice(targetIdx, 0, dragged);
            renderSidebar();
        });
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

loadStory();
```

- [ ] **Step 2: Test manually**

Create a story, edit scenes, add mad libs, change theme, save

- [ ] **Step 3: Commit**

```bash
git add static/js/editor.js
git commit -m "feat: implement story editor functionality"
```

---

## Chunk 9: Run and Player Views

### Task 9.1: Run View HTML

**Files:**
- Modify: `static/pages/run.html`

- [ ] **Step 1: Create run view HTML**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Run Story - J&B's RPG</title>
    <link rel="stylesheet" href="/static/css/base.css">
    <style>
        .run-layout {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }
        .status-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-md) var(--space-lg);
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--text-secondary);
            flex-wrap: wrap;
            gap: var(--space-md);
        }
        .status-bar__left, .status-bar__right {
            display: flex;
            align-items: center;
            gap: var(--space-lg);
        }
        .stat {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
        }
        .scene-panel {
            flex: 1;
            padding: var(--space-xl);
            max-width: 800px;
            margin: 0 auto;
            width: 100%;
        }
        .scene-title {
            font-size: 0.875rem;
            color: var(--text-secondary);
            margin-bottom: var(--space-sm);
        }
        .scene-text {
            font-size: 1.25rem;
            line-height: 1.7;
            margin-bottom: var(--space-xl);
        }
        .choices {
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
        }
        .choice-btn {
            padding: var(--space-md) var(--space-lg);
            border-radius: var(--radius-md);
            border: 2px solid;
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-size: 1rem;
            cursor: pointer;
            text-align: left;
            transition: transform 0.1s;
        }
        .choice-btn:hover {
            transform: translateX(4px);
        }
        .choice-btn--damage {
            border-color: var(--danger);
        }
        .choice-btn--item {
            border-color: var(--success);
        }
        .choice-btn--level {
            border-color: var(--warning);
        }
        .choice-outcome {
            font-size: 0.875rem;
            opacity: 0.8;
        }
        .controls {
            padding: var(--space-md) var(--space-lg);
            background: var(--bg-secondary);
            border-top: 1px solid var(--text-secondary);
            display: flex;
            gap: var(--space-md);
        }
        .madlib-view {
            text-align: center;
            padding: var(--space-xl);
        }
        .madlib-prompt {
            font-size: 1.5rem;
            margin-bottom: var(--space-lg);
        }
        .madlib-input {
            font-size: 1.25rem;
            max-width: 400px;
            margin: 0 auto var(--space-lg);
        }
        .madlib-answers {
            margin-top: var(--space-xl);
            color: var(--text-secondary);
        }
        .finale-view {
            text-align: center;
            padding: var(--space-xl);
        }
        .finale-stats {
            display: flex;
            justify-content: center;
            gap: var(--space-xl);
            margin: var(--space-xl) 0;
        }
        .finale-stat {
            text-align: center;
        }
        .finale-stat__value {
            font-size: 2rem;
            font-weight: bold;
        }
        .finale-stat__label {
            color: var(--text-secondary);
        }
        .roll-info {
            background: var(--bg-secondary);
            padding: var(--space-lg);
            border-radius: var(--radius-md);
            margin: var(--space-xl) auto;
            max-width: 400px;
        }
        .outcome-victory {
            color: var(--success);
            font-size: 2rem;
        }
        .outcome-defeat {
            color: var(--danger);
            font-size: 2rem;
        }
        .character-reveal {
            text-align: center;
            padding: var(--space-xl);
        }
        .character-description {
            font-size: 1.25rem;
            max-width: 600px;
            margin: 0 auto var(--space-xl);
            line-height: 1.7;
        }
        .previous-scene {
            margin-top: var(--space-xl);
            padding: var(--space-md);
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
            font-size: 0.875rem;
            color: var(--text-secondary);
        }
        .connected-count {
            font-size: 0.875rem;
            color: var(--text-secondary);
        }
    </style>
</head>
<body>
    <div class="run-layout">
        <div class="status-bar">
            <div class="status-bar__left">
                <strong id="story-title">Loading...</strong>
                <div class="stat">
                    <span id="hp-display"></span>
                </div>
                <div class="stat">Level <strong id="level-display">1</strong></div>
                <div class="stat">Items <strong id="items-count">0</strong></div>
            </div>
            <div class="status-bar__right">
                <span id="scene-progress">Scene 1 of 1</span>
                <span id="connected-count" class="connected-count"></span>
            </div>
        </div>

        <main id="main-content" class="scene-panel">
            <p>Loading...</p>
        </main>

        <div class="controls" id="controls">
            <button class="btn btn--secondary" onclick="goBack()">Back</button>
            <button class="btn btn--danger" onclick="restart()">Restart</button>
            <details style="margin-left: auto;">
                <summary style="cursor: pointer;">Character</summary>
                <div id="character-ref" style="padding: var(--space-md); max-width: 400px;"></div>
            </details>
        </div>
    </div>

    <script src="/static/js/api.js"></script>
    <script src="/static/js/sse.js"></script>
    <script src="/static/js/theme.js"></script>
    <script src="/static/js/run.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add static/pages/run.html
git commit -m "feat: add run view HTML structure"
```

---

### Task 9.2: Run View JavaScript

**Files:**
- Create: `static/js/run.js`

- [ ] **Step 1: Create run.js**

```javascript
// static/js/run.js
const params = new URLSearchParams(window.location.search);
const storyId = params.get('story');

let story = null;
let state = null;
let resolved = null;
let connectedCount = 0;

const sse = new SSEClient(handleStateUpdate);

async function init() {
    if (!storyId) {
        alert('No story ID');
        window.location.href = '/';
        return;
    }

    story = await API.getStory(storyId);
    document.getElementById('story-title').textContent = story.title;
    ThemeManager.setTheme(story.theme);

    // Check if session exists
    const current = await API.getState();
    if (current.state && current.state.story_id === storyId) {
        state = current.state;
        resolved = current.resolved;
        render();
    } else {
        // Start new session
        const result = await API.startSession(storyId);
        state = result.state;
        resolved = result.resolved;
        render();
    }

    sse.connect();
}

function handleStateUpdate(data) {
    state = data.state;
    resolved = data.resolved;
    connectedCount = data.connected_count;
    render();
}

function render() {
    if (!state) {
        document.getElementById('main-content').innerHTML = '<p>No active session</p>';
        return;
    }

    updateStatusBar();

    if (state.status === 'madlib_in_progress') {
        renderMadlib();
    } else if (state.status === 'game_over') {
        renderFinale();
    } else {
        renderScene();
    }
}

function updateStatusBar() {
    // HP display
    const hpHtml = Array(story.settings.starting_hp).fill(0).map((_, i) =>
        `<span class="hp-indicator ${i >= state.hp ? 'hp-indicator--empty' : ''}">♥</span>`
    ).join('');
    document.getElementById('hp-display').innerHTML = hpHtml;

    document.getElementById('level-display').textContent = state.level;
    document.getElementById('items-count').textContent = state.items.length;

    const sceneIdx = story.scenes.findIndex(s => s.id === state.current_scene_id) + 1;
    document.getElementById('scene-progress').textContent = `Scene ${sceneIdx} of ${story.scenes.length}`;

    document.getElementById('connected-count').textContent = `${connectedCount} connected`;

    if (state.character) {
        document.getElementById('character-ref').textContent = state.character.description;
    }
}

function renderMadlib() {
    const field = story.madlib_template.fields[state.madlib_step];
    if (!field) return;

    const answeredHtml = Object.entries(state.madlib_answers)
        .map(([k, v]) => `<div><strong>${k}:</strong> ${escapeHtml(v)}</div>`)
        .join('');

    document.getElementById('main-content').innerHTML = `
        <div class="madlib-view">
            <div style="color: var(--text-secondary); margin-bottom: var(--space-md);">
                Question ${state.madlib_step + 1} of ${story.madlib_template.fields.length}
            </div>
            <div class="madlib-prompt">${escapeHtml(field.label)}</div>
            <input class="input madlib-input" id="madlib-input" autofocus
                   onkeypress="if(event.key === 'Enter') submitMadlib()">
            <button class="btn" onclick="submitMadlib()">Submit</button>
            <div class="madlib-answers">${answeredHtml}</div>
        </div>
    `;
    document.getElementById('madlib-input').focus();
}

async function submitMadlib() {
    const input = document.getElementById('madlib-input');
    const value = input.value.trim();
    if (!value) return;

    const field = story.madlib_template.fields[state.madlib_step];
    const result = await API.submitMadlib(field.key, value);
    state = result.state;
    resolved = result.resolved;

    // Check if character was just created
    if (state.character && state.status === 'running') {
        renderCharacterReveal();
    } else {
        render();
    }
}

function renderCharacterReveal() {
    document.getElementById('main-content').innerHTML = `
        <div class="character-reveal">
            <h2>Your Character</h2>
            <div class="character-description">${escapeHtml(state.character.description)}</div>
            <button class="btn" onclick="render()">Begin the Story</button>
        </div>
    `;
}

function renderScene() {
    const scene = story.scenes.find(s => s.id === state.current_scene_id);
    if (!scene) return;

    const sceneIdx = story.scenes.findIndex(s => s.id === state.current_scene_id) + 1;

    const choicesHtml = scene.choices.map((c, i) => {
        let outcome = '';
        if (c.kind === 'damage') outcome = '−1 HP';
        else if (c.kind === 'item') outcome = c.item_name;
        else if (c.kind === 'level') outcome = 'Level Up';

        return `
            <button class="choice-btn choice-btn--${c.kind}" onclick="makeChoice(${i})">
                ${escapeHtml(c.text)}
                <div class="choice-outcome">${outcome}</div>
            </button>
        `;
    }).join('');

    // Previous scene reminder
    let prevHtml = '';
    if (state.history.length > 0) {
        const lastEntry = state.history[state.history.length - 1];
        const prevScene = story.scenes.find(s => s.id === lastEntry.scene_id);
        if (prevScene) {
            prevHtml = `
                <div class="previous-scene">
                    Previous: ${escapeHtml(prevScene.title)} — ${lastEntry.outcome}
                </div>
            `;
        }
    }

    document.getElementById('main-content').innerHTML = `
        <div class="scene-title">Scene ${sceneIdx}: ${escapeHtml(scene.title)}</div>
        <div class="scene-text">${escapeHtml(resolved?.scene_text || scene.base_text)}</div>
        <div class="choices">${choicesHtml}</div>
        ${prevHtml}
    `;
}

async function makeChoice(index) {
    const result = await API.makeChoice(index);
    state = result.state;
    resolved = result.resolved;
    render();
}

function renderFinale() {
    const rollCount = state.level;
    const bonus = state.items.length;

    let outcomeHtml = '';
    if (state.outcome === 'victory') {
        outcomeHtml = '<div class="outcome-victory">VICTORY!</div>';
    } else if (state.outcome === 'defeat') {
        outcomeHtml = '<div class="outcome-defeat">DEFEATED</div>';
    } else {
        outcomeHtml = `
            <div class="roll-info">
                <div style="margin-bottom: var(--space-md);">
                    <strong>Roll the dice!</strong>
                </div>
                <div>You have <strong>${rollCount}</strong> roll${rollCount > 1 ? 's' : ''}</div>
                <div>Add <strong>+${bonus}</strong> to each roll</div>
                <div>Need <strong>20 or higher</strong> to win</div>
            </div>
            <div style="display: flex; gap: var(--space-md); justify-content: center; margin-top: var(--space-lg);">
                <button class="btn" onclick="finishGame('victory')">Victory!</button>
                <button class="btn btn--danger" onclick="finishGame('defeat')">Defeated</button>
            </div>
        `;
    }

    document.getElementById('main-content').innerHTML = `
        <div class="finale-view">
            <h2>The Final Challenge</h2>
            <div class="finale-stats">
                <div class="finale-stat">
                    <div class="finale-stat__value">${state.hp}</div>
                    <div class="finale-stat__label">HP Remaining</div>
                </div>
                <div class="finale-stat">
                    <div class="finale-stat__value">${state.level}</div>
                    <div class="finale-stat__label">Level</div>
                </div>
                <div class="finale-stat">
                    <div class="finale-stat__value">${state.items.length}</div>
                    <div class="finale-stat__label">Items</div>
                </div>
            </div>
            ${state.items.length > 0 ? `
                <div style="margin-bottom: var(--space-lg);">
                    Items: ${state.items.map(i => escapeHtml(i)).join(', ')}
                </div>
            ` : ''}
            ${outcomeHtml}
        </div>
    `;
}

async function finishGame(outcome) {
    await API.finish(outcome);
}

async function goBack() {
    await API.goBack();
}

async function restart() {
    if (!confirm('Restart the session?')) return;
    await API.restart();
    const result = await API.startSession(storyId);
    state = result.state;
    resolved = result.resolved;
    render();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

init();
```

- [ ] **Step 2: Commit**

```bash
git add static/js/run.js
git commit -m "feat: implement run view with madlibs, scenes, finale"
```

---

### Task 9.3: Player View

**Files:**
- Modify: `static/pages/player.html`
- Create: `static/js/player.js`

- [ ] **Step 1: Create player HTML**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Player View - J&B's RPG</title>
    <link rel="stylesheet" href="/static/css/base.css">
    <style>
        .player-layout {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: var(--space-lg);
            text-align: center;
        }
        .character-name {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: var(--space-lg);
            cursor: pointer;
        }
        .hp-display {
            display: flex;
            justify-content: center;
            gap: var(--space-md);
            margin-bottom: var(--space-xl);
        }
        .hp-indicator {
            width: 48px;
            height: 48px;
            font-size: 2rem;
        }
        .stats {
            display: flex;
            gap: var(--space-xl);
            margin-bottom: var(--space-xl);
        }
        .stat-block {
            text-align: center;
        }
        .stat-block__value {
            font-size: 2.5rem;
            font-weight: bold;
        }
        .stat-block__label {
            color: var(--text-secondary);
        }
        .items-list {
            list-style: none;
            margin-bottom: var(--space-xl);
        }
        .items-list li {
            padding: var(--space-sm);
        }
        .progress-bar {
            width: 100%;
            max-width: 300px;
            height: 8px;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
            overflow: hidden;
            margin-bottom: var(--space-sm);
        }
        .progress-bar__fill {
            height: 100%;
            background: var(--accent);
            transition: width 0.3s;
        }
        .waiting-state {
            color: var(--text-secondary);
        }
        .modal {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-lg);
        }
        .modal__content {
            background: var(--bg-secondary);
            padding: var(--space-xl);
            border-radius: var(--radius-lg);
            max-width: 500px;
        }
        .modal--hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div id="player-view" class="player-layout">
        <div class="waiting-state">
            <p>Waiting for storyteller to start...</p>
        </div>
    </div>

    <div id="character-modal" class="modal modal--hidden" onclick="closeModal()">
        <div class="modal__content" onclick="event.stopPropagation()">
            <h2 id="modal-name"></h2>
            <p id="modal-description"></p>
        </div>
    </div>

    <script src="/static/js/api.js"></script>
    <script src="/static/js/sse.js"></script>
    <script src="/static/js/theme.js"></script>
    <script src="/static/js/player.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create player.js**

```javascript
// static/js/player.js
let story = null;
let state = null;

const sse = new SSEClient(handleStateUpdate);

async function init() {
    sse.connect();
}

async function handleStateUpdate(data) {
    state = data.state;

    if (!state) {
        renderWaiting();
        return;
    }

    // Load story if needed
    if (!story || story.id !== state.story_id) {
        story = await API.getStory(state.story_id);
        ThemeManager.setTheme(story.theme);
    }

    render();
}

function renderWaiting() {
    document.getElementById('player-view').innerHTML = `
        <div class="waiting-state">
            <p>Waiting for storyteller to start...</p>
        </div>
    `;
}

function render() {
    if (!state || !story) return;

    const sceneIdx = story.scenes.findIndex(s => s.id === state.current_scene_id) + 1;
    const progress = (sceneIdx / story.scenes.length) * 100;

    const hpHtml = Array(story.settings.starting_hp).fill(0).map((_, i) =>
        `<span class="hp-indicator ${i >= state.hp ? 'hp-indicator--empty' : ''}">♥</span>`
    ).join('');

    const itemsHtml = state.items.length > 0
        ? `<ul class="items-list">${state.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
        : '<p style="color: var(--text-secondary);">No items yet</p>';

    let statusHtml = '';
    if (state.status === 'madlib_in_progress') {
        statusHtml = '<p>Creating character...</p>';
    } else if (state.status === 'game_over') {
        if (state.outcome === 'victory') {
            statusHtml = '<p style="color: var(--success); font-size: 1.5rem;">VICTORY!</p>';
        } else if (state.outcome === 'defeat') {
            statusHtml = '<p style="color: var(--danger); font-size: 1.5rem;">DEFEATED</p>';
        } else {
            statusHtml = '<p>Awaiting final roll...</p>';
        }
    }

    document.getElementById('player-view').innerHTML = `
        ${state.character ? `
            <div class="character-name" onclick="showCharacter()">
                ${escapeHtml(state.character.name)}
            </div>
        ` : ''}

        <div class="hp-display hp-container">${hpHtml}</div>

        <div class="stats">
            <div class="stat-block">
                <div class="stat-block__value">${state.level}</div>
                <div class="stat-block__label">Level</div>
            </div>
            <div class="stat-block">
                <div class="stat-block__value">${state.items.length}</div>
                <div class="stat-block__label">Items</div>
            </div>
        </div>

        ${itemsHtml}

        <div class="progress-bar">
            <div class="progress-bar__fill" style="width: ${progress}%"></div>
        </div>
        <div style="color: var(--text-secondary);">Scene ${sceneIdx} of ${story.scenes.length}</div>

        ${statusHtml}
    `;
}

function showCharacter() {
    if (!state?.character) return;
    document.getElementById('modal-name').textContent = state.character.name;
    document.getElementById('modal-description').textContent = state.character.description;
    document.getElementById('character-modal').classList.remove('modal--hidden');
}

function closeModal() {
    document.getElementById('character-modal').classList.add('modal--hidden');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

init();
```

- [ ] **Step 3: Test with multiple browser tabs**

Open /run in one tab, /player in another, verify SSE sync

- [ ] **Step 4: Commit**

```bash
git add static/pages/player.html static/js/player.js
git commit -m "feat: implement player view with SSE sync"
```

---

## Chunk 10: Themes

### Task 10.1: Cyberpunk Theme

**Files:**
- Create: `static/css/themes/cyberpunk.css`

- [ ] **Step 1: Create cyberpunk theme**

```css
/* static/css/themes/cyberpunk.css */
:root {
    --bg-primary: #0a0a12;
    --bg-secondary: #12121f;
    --text-primary: #e0e0ff;
    --text-secondary: #8080a0;
    --accent: #00fff0;
    --accent-hover: #00d4c8;
    --danger: #ff0055;
    --success: #00ff88;
    --warning: #ffaa00;

    --font-display: 'Orbitron', 'Rajdhani', system-ui, sans-serif;
}

body {
    background-image:
        repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 255, 240, 0.03) 2px,
            rgba(0, 255, 240, 0.03) 4px
        );
}

.card, .choice-btn, .btn {
    clip-path: polygon(
        0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px,
        100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px)
    );
}

.hp-indicator::before {
    content: '▣';
    color: var(--accent);
}

.hp-indicator--empty::before {
    color: var(--bg-secondary);
}

h1, h2, .nav__title, .character-name {
    font-family: var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.scene-text::first-letter {
    color: var(--accent);
    font-size: 1.5em;
}
```

- [ ] **Step 2: Commit**

```bash
git add static/css/themes/cyberpunk.css
git commit -m "feat: add cyberpunk theme"
```

---

### Task 10.2: Fantasy Theme

**Files:**
- Create: `static/css/themes/fantasy.css`

- [ ] **Step 1: Create fantasy theme**

```css
/* static/css/themes/fantasy.css */
:root {
    --bg-primary: #1a1410;
    --bg-secondary: #2a2018;
    --text-primary: #f4e8d8;
    --text-secondary: #a89080;
    --accent: #d4a574;
    --accent-hover: #e8b888;
    --danger: #8b3a3a;
    --success: #4a7c4a;
    --warning: #b8860b;

    --font-body: 'Crimson Text', 'Georgia', serif;
    --font-display: 'Cinzel', 'Trajan Pro', serif;
}

.card {
    border: 2px solid var(--accent);
    border-image: linear-gradient(135deg, var(--accent), transparent, var(--accent)) 1;
}

.hp-indicator::before {
    content: '🏮';
}

.hp-indicator--empty::before {
    filter: grayscale(1) opacity(0.3);
}

h1, h2, .nav__title, .character-name {
    font-family: var(--font-display);
}

.scene-text {
    font-family: var(--font-body);
}

.scene-text::first-letter {
    font-size: 2em;
    float: left;
    line-height: 1;
    margin-right: 0.1em;
    color: var(--accent);
    font-family: var(--font-display);
}

.choice-btn {
    border-style: double;
    border-width: 4px;
}
```

- [ ] **Step 2: Commit**

```bash
git add static/css/themes/fantasy.css
git commit -m "feat: add fantasy theme"
```

---

### Task 10.3: Deep Space Theme

**Files:**
- Create: `static/css/themes/deep_space.css`

- [ ] **Step 1: Create deep space theme**

```css
/* static/css/themes/deep_space.css */
:root {
    --bg-primary: #0a0a14;
    --bg-secondary: #101020;
    --text-primary: #e8e0f8;
    --text-secondary: #8080a0;
    --accent: #9b59b6;
    --accent-hover: #b370cf;
    --danger: #c0392b;
    --success: #27ae60;
    --warning: #f1c40f;

    --font-display: 'Space Mono', 'Courier New', monospace;
}

body {
    background-image:
        radial-gradient(1px 1px at 20px 30px, white, transparent),
        radial-gradient(1px 1px at 40px 70px, rgba(255,255,255,0.8), transparent),
        radial-gradient(1px 1px at 90px 40px, rgba(255,255,255,0.6), transparent),
        radial-gradient(1px 1px at 130px 80px, white, transparent),
        radial-gradient(1px 1px at 160px 120px, rgba(255,255,255,0.7), transparent);
    background-size: 200px 150px;
}

.hp-indicator::before {
    content: '★';
    color: var(--warning);
}

.hp-indicator--empty::before {
    content: '☆';
    color: var(--text-secondary);
}

h1, h2, .nav__title {
    font-family: var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.2em;
}

.card {
    border: 1px solid var(--accent);
}

.scene-title::before {
    content: '>>> ';
    color: var(--accent);
}
```

- [ ] **Step 2: Commit**

```bash
git add static/css/themes/deep_space.css
git commit -m "feat: add deep space theme"
```

---

### Task 10.4: Modern Theme

**Files:**
- Create: `static/css/themes/modern.css`

- [ ] **Step 1: Create modern theme**

```css
/* static/css/themes/modern.css */
:root {
    --bg-primary: #f5f5f7;
    --bg-secondary: #ffffff;
    --text-primary: #1d1d1f;
    --text-secondary: #6e6e73;
    --accent: #667eea;
    --accent-hover: #5a6fd6;
    --danger: #ff3b30;
    --success: #34c759;
    --warning: #ff9500;

    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
}

[data-mode="dark"] {
    --bg-primary: #1c1c1e;
    --bg-secondary: #2c2c2e;
    --text-primary: #f5f5f7;
    --text-secondary: #8e8e93;
}

.card {
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.hp-indicator::before {
    content: '●';
    color: var(--danger);
}

.hp-indicator--empty::before {
    content: '○';
    color: var(--text-secondary);
}

.btn {
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.choice-btn {
    border-width: 1px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
```

- [ ] **Step 2: Commit**

```bash
git add static/css/themes/modern.css
git commit -m "feat: add modern theme"
```

---

### Task 10.5: Horror Theme

**Files:**
- Create: `static/css/themes/horror.css`

- [ ] **Step 1: Create horror theme**

```css
/* static/css/themes/horror.css */
:root {
    --bg-primary: #0d0d0d;
    --bg-secondary: #1a0a0a;
    --text-primary: #d0c0c0;
    --text-secondary: #804040;
    --accent: #8b0000;
    --accent-hover: #a00000;
    --danger: #ff0000;
    --success: #006400;
    --warning: #ff4500;

    --font-body: 'Crimson Text', serif;
    --font-display: 'Nosifer', 'Creepster', cursive;
}

body {
    background-image:
        radial-gradient(ellipse at center, transparent 0%, var(--bg-primary) 70%);
}

.card {
    border: 1px solid var(--accent);
    box-shadow: 0 0 20px rgba(139, 0, 0, 0.3);
}

.hp-indicator::before {
    content: '👁';
}

.hp-indicator--empty::before {
    filter: grayscale(1) opacity(0.3);
}

h1, h2, .nav__title {
    font-family: var(--font-display);
    text-shadow: 0 0 10px var(--danger);
}

.choice-btn {
    border-color: var(--accent);
}

.choice-btn:hover {
    box-shadow: 0 0 15px rgba(139, 0, 0, 0.5);
}

.scene-text {
    font-family: var(--font-body);
}
```

- [ ] **Step 2: Commit**

```bash
git add static/css/themes/horror.css
git commit -m "feat: add horror theme"
```

---

## Final Integration

### Task 11.1: End-to-End Test

- [ ] **Step 1: Run the server**

```bash
python main.py
```

- [ ] **Step 2: Test complete flow**

1. Visit http://localhost:8000/
2. Create a new story
3. Add scenes with all choice types
4. Set up mad libs template
5. Run the story
6. Complete mad libs
7. Make choices through scenes
8. Complete finale
9. Verify player view syncs

- [ ] **Step 3: Test on phone**

Connect phone to same network, visit http://<laptop-ip>:8000/player

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete J&B's RPG implementation"
```

---

## Summary

**Total tasks:** 30+
**Estimated time:** 4-6 hours focused work
**Key checkpoints:**
1. After Chunk 2: Backend API functional
2. After Chunk 4: Full state management working
3. After Chunk 7: Library page working
4. After Chunk 9: Full app working
5. After Chunk 10: Themes complete

The plan follows TDD where practical, with manual testing for UI components. Each chunk is independently reviewable and produces working functionality.
