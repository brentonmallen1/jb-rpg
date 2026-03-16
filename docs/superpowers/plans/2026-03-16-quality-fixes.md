# Quality Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all quality issues identified in the app audit - validation gaps, race conditions, theme problems, code duplication, and missing tests.

**Architecture:** Backend fixes add validation and thread-safety to existing endpoints. Frontend fixes extract shared utilities, improve theme CSS, and add UX polish. Test additions cover gaps in SSE and edge cases.

**Tech Stack:** Python/FastAPI, vanilla JS, CSS, pytest

---

## Chunk 1: Backend Validation & Safety

### Task 1.1: Fix SSE Connection Race Condition

**Files:**
- Modify: `main.py:250-270`
- Test: `tests/test_sse.py` (create)

- [ ] **Step 1.1.1: Write the failing test for concurrent SSE access**

Create `tests/test_sse.py`:

```python
import pytest
import asyncio
from unittest.mock import AsyncMock, patch


def test_sse_connections_uses_lock():
    """Verify sse_connections access is protected by a lock."""
    import main
    assert hasattr(main, 'sse_lock'), "main.py must define sse_lock"
    assert isinstance(main.sse_lock, type(asyncio.Lock())), "sse_lock must be an asyncio.Lock"
```

- [ ] **Step 1.1.2: Run test to verify it fails**

Run: `uv run pytest tests/test_sse.py::test_sse_connections_uses_lock -v`
Expected: FAIL with "AssertionError: main.py must define sse_lock"

- [ ] **Step 1.1.3: Add asyncio.Lock to main.py**

In `main.py`, after line 250 (`sse_connections: set = set()`), add:

```python
sse_connections: set = set()
sse_lock = asyncio.Lock()
```

- [ ] **Step 1.1.4: Update broadcast_state to use the lock**

Replace the `broadcast_state` function:

```python
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
```

- [ ] **Step 1.1.5: Update sse_events to use the lock**

In the `sse_events` function, replace direct set operations:

```python
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
```

- [ ] **Step 1.1.6: Run test to verify it passes**

Run: `uv run pytest tests/test_sse.py -v`
Expected: PASS

- [ ] **Step 1.1.7: Run all tests to ensure no regressions**

Run: `uv run pytest -v`
Expected: All tests PASS

- [ ] **Step 1.1.8: Commit**

```bash
git add main.py tests/test_sse.py
git commit -m "fix: add asyncio.Lock to SSE connections for thread safety"
```

---

### Task 1.2: Add Item Name Validation

**Files:**
- Modify: `main.py:548-560`
- Test: `tests/test_state_api.py`

- [ ] **Step 1.2.1: Write the failing test**

Add to `tests/test_state_api.py`:

```python
def test_choice_item_without_name_422(client):
    """Item choice with empty item_name should return 422."""
    scenes = [
        {
            "id": "s1",
            "title": "Scene 1",
            "base_text": "Find something.",
            "choices": [{"kind": "item", "text": "Take thing", "amount": 1, "item_name": ""}],
            "conditional_text": [],
        }
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 422
    assert "item_name" in resp.json()["detail"].lower()


def test_choice_item_null_name_422(client):
    """Item choice with null item_name should return 422."""
    scenes = [
        {
            "id": "s1",
            "title": "Scene 1",
            "base_text": "Find something.",
            "choices": [{"kind": "item", "text": "Take thing", "amount": 1, "item_name": None}],
            "conditional_text": [],
        }
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 422
```

- [ ] **Step 1.2.2: Run tests to verify they fail**

Run: `uv run pytest tests/test_state_api.py::test_choice_item_without_name_422 tests/test_state_api.py::test_choice_item_null_name_422 -v`
Expected: FAIL (currently adds empty string to items)

- [ ] **Step 1.2.3: Add validation in make_choice endpoint**

In `main.py`, in the `make_choice` function, after line 548 (`choice = scene.choices[request.choice_index]`), add:

```python
    choice = scene.choices[request.choice_index]

    # Validate item choices have item_name
    if choice.kind == ChoiceKind.ITEM and not choice.item_name:
        raise HTTPException(status_code=422, detail="Item choice must have item_name")
```

- [ ] **Step 1.2.4: Run tests to verify they pass**

Run: `uv run pytest tests/test_state_api.py::test_choice_item_without_name_422 tests/test_state_api.py::test_choice_item_null_name_422 -v`
Expected: PASS

- [ ] **Step 1.2.5: Run all tests**

Run: `uv run pytest -v`
Expected: All tests PASS

- [ ] **Step 1.2.6: Commit**

```bash
git add main.py tests/test_state_api.py
git commit -m "fix: validate item_name is non-empty for item choices"
```

---

### Task 1.3: Add Story Title Sanitization

**Files:**
- Modify: `main.py:294-308`
- Test: `tests/test_story_api.py`

- [ ] **Step 1.3.1: Write the failing tests**

Add to `tests/test_story_api.py`:

```python
def test_create_story_empty_title_422(client):
    """Empty title should return 422."""
    response = client.post("/api/stories", json={"title": ""})
    assert response.status_code == 422


def test_create_story_whitespace_title_422(client):
    """Whitespace-only title should return 422."""
    response = client.post("/api/stories", json={"title": "   "})
    assert response.status_code == 422


def test_create_story_title_trimmed(client):
    """Title with leading/trailing whitespace should be trimmed."""
    response = client.post("/api/stories", json={"title": "  My Story  "})
    assert response.status_code == 200
    assert response.json()["title"] == "My Story"
```

- [ ] **Step 1.3.2: Run tests to verify they fail**

Run: `uv run pytest tests/test_story_api.py::test_create_story_empty_title_422 tests/test_story_api.py::test_create_story_whitespace_title_422 tests/test_story_api.py::test_create_story_title_trimmed -v`
Expected: FAIL

- [ ] **Step 1.3.3: Add validation to create_story endpoint**

In `main.py`, update the `create_story` function:

```python
@app.post("/api/stories")
async def create_story(request: CreateStoryRequest) -> Story:
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
```

- [ ] **Step 1.3.4: Run tests to verify they pass**

Run: `uv run pytest tests/test_story_api.py::test_create_story_empty_title_422 tests/test_story_api.py::test_create_story_whitespace_title_422 tests/test_story_api.py::test_create_story_title_trimmed -v`
Expected: PASS

- [ ] **Step 1.3.5: Run all tests**

Run: `uv run pytest -v`
Expected: All tests PASS

- [ ] **Step 1.3.6: Commit**

```bash
git add main.py tests/test_story_api.py
git commit -m "fix: validate and trim story titles"
```

---

### Task 1.4: Add CORS Middleware

**Files:**
- Modify: `main.py:187-197`

- [ ] **Step 1.4.1: Add CORS middleware import and configuration**

In `main.py`, after the imports, add:

```python
from fastapi.middleware.cors import CORSMiddleware
```

After `app = FastAPI(title="J&B's RPG")` (line 187), add:

```python
app = FastAPI(title="J&B's RPG")

# Allow local network access for multi-device play
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- [ ] **Step 1.4.2: Run all tests to verify no regressions**

Run: `uv run pytest -v`
Expected: All tests PASS

- [ ] **Step 1.4.3: Commit**

```bash
git add main.py
git commit -m "feat: add CORS middleware for local network multi-device play"
```

---

## Chunk 2: Theme System Fixes

### Task 2.1: Extract Shared JS Utilities

**Files:**
- Create: `static/js/utils.js`
- Modify: `static/js/library.js`
- Modify: `static/js/editor.js`
- Modify: `static/js/run.js`
- Modify: `static/js/player.js`
- Modify: `static/pages/index.html`
- Modify: `static/pages/editor.html`
- Modify: `static/pages/run.html`
- Modify: `static/pages/player.html`

- [ ] **Step 2.1.1: Create utils.js with shared functions**

Create `static/js/utils.js`:

```javascript
// static/js/utils.js

/**
 * Escape HTML special characters to prevent XSS.
 * @param {*} text - Value to escape (converted to string)
 * @returns {string} Escaped HTML string
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Escape text for use in HTML attributes.
 * @param {*} text - Value to escape
 * @returns {string} Escaped attribute string
 */
function escapeAttr(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 2.1.2: Add utils.js to index.html**

In `static/pages/index.html`, add before api.js:

```html
    <script src="/static/js/utils.js"></script>
    <script src="/static/js/api.js"></script>
```

- [ ] **Step 2.1.3: Remove escapeHtml from library.js**

In `static/js/library.js`, delete lines 58-63 (the escapeHtml function).

- [ ] **Step 2.1.4: Add utils.js to editor.html**

In `static/pages/editor.html`, add before api.js:

```html
    <script src="/static/js/utils.js"></script>
    <script src="/static/js/api.js"></script>
```

- [ ] **Step 2.1.5: Remove escapeHtml and escapeAttr from editor.js**

In `static/js/editor.js`, delete lines 456-466 (both escape functions).

- [ ] **Step 2.1.6: Add utils.js to run.html**

In `static/pages/run.html`, add before api.js:

```html
    <script src="/static/js/utils.js"></script>
    <script src="/static/js/api.js"></script>
```

- [ ] **Step 2.1.7: Remove escapeHtml from run.js**

In `static/js/run.js`, delete lines 318-323 (the escapeHtml function).

- [ ] **Step 2.1.8: Add utils.js to player.html**

In `static/pages/player.html`, add before api.js:

```html
    <script src="/static/js/utils.js"></script>
    <script src="/static/js/api.js"></script>
```

- [ ] **Step 2.1.9: Remove escapeHtml from player.js**

In `static/js/player.js`, delete lines 113-118 (the escapeHtml function).

- [ ] **Step 2.1.10: Manually test the app**

Open browser to http://localhost:8000 and verify:
- Library page loads and displays stories
- Editor page allows editing scenes
- Run page shows scenes correctly
- Player page displays stats

- [ ] **Step 2.1.11: Commit**

```bash
git add static/js/utils.js static/js/library.js static/js/editor.js static/js/run.js static/js/player.js static/pages/*.html
git commit -m "refactor: extract shared JS utilities to utils.js"
```

---

### Task 2.2: Fix HP Indicators to Use Theme CSS

**Files:**
- Modify: `static/js/run.js:77-84`
- Modify: `static/js/player.js:48-50`

- [ ] **Step 2.2.1: Update run.js HP rendering**

In `static/js/run.js`, replace the `updateStatusBar` HP rendering (lines 81-84):

```javascript
function updateStatusBar() {
    if (!story || !state) return;

    // HP display - use empty span, let CSS provide the indicator
    const hpHtml = Array.from({ length: story.settings.starting_hp }, (_, i) =>
        `<span class="hp-indicator ${i >= state.hp ? 'hp-indicator--empty' : ''}"></span>`
    ).join('');
    document.getElementById('hp-display').innerHTML = hpHtml;
```

- [ ] **Step 2.2.2: Update player.js HP rendering**

In `static/js/player.js`, replace the HP rendering (lines 48-50):

```javascript
    const hpHtml = Array.from({ length: story.settings.starting_hp }, (_, i) =>
        `<span class="hp-indicator ${i >= state.hp ? 'hp-indicator--empty' : ''}"></span>`
    ).join('');
```

- [ ] **Step 2.2.3: Update base.css with default HP indicator**

In `static/css/base.css`, update the HP indicator styles:

```css
.hp-indicator {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
}

/* Default indicator (heart) - overridden by themes */
.hp-indicator::before {
    content: '\2665'; /* Heart symbol */
}

.hp-indicator--empty {
    opacity: 0.3;
}
```

- [ ] **Step 2.2.4: Manually test themes**

Start the server and test each theme shows proper HP indicators:
- Cyberpunk: should show memory chips
- Fantasy: should show lanterns
- Deep Space: should show stars
- Modern: should show circles
- Horror: should show eyes

- [ ] **Step 2.2.5: Commit**

```bash
git add static/js/run.js static/js/player.js static/css/base.css
git commit -m "fix: let theme CSS control HP indicators instead of inline hearts"
```

---

### Task 2.3: Add Google Fonts Imports to Themes

**Files:**
- Modify: `static/css/themes/fantasy.css`
- Modify: `static/css/themes/cyberpunk.css`
- Modify: `static/css/themes/deep_space.css`
- Modify: `static/css/themes/modern.css`
- Modify: `static/css/themes/horror.css`

- [ ] **Step 2.3.1: Add fonts to fantasy.css**

At the top of `static/css/themes/fantasy.css`, add:

```css
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');

/* static/css/themes/fantasy.css */
```

- [ ] **Step 2.3.2: Update cyberpunk.css with themed HP and fonts**

Update `static/css/themes/cyberpunk.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&family=Share+Tech+Mono&display=swap');

/* static/css/themes/cyberpunk.css */
:root {
    --bg-primary: #0a0a12;
    --bg-secondary: #12121f;
    --text-primary: #0ff;
    --text-secondary: #888;
    --accent: #f0f;
    --accent-hover: #f5f;
    --danger: #f00;
    --success: #0f0;
    --warning: #ff0;

    --font-body: 'Share Tech Mono', monospace;
    --font-display: 'Orbitron', sans-serif;
}

/* Memory chip HP indicators */
.hp-indicator::before {
    content: '\1F4BE'; /* Floppy disk / memory */
    font-size: 1.25rem;
}

.hp-indicator--empty {
    filter: grayscale(1) opacity(0.3);
}

/* Scanline effect */
body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 255, 255, 0.03) 2px,
        rgba(0, 255, 255, 0.03) 4px
    );
    pointer-events: none;
    z-index: 9999;
}

/* Clipped corners on cards */
.card {
    clip-path: polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
}
```

- [ ] **Step 2.3.3: Update deep_space.css with themed HP and fonts**

Update `static/css/themes/deep_space.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;600&family=Space+Mono&display=swap');

/* static/css/themes/deep_space.css */
:root {
    --bg-primary: #0a0a1a;
    --bg-secondary: #141428;
    --text-primary: #e8e8ff;
    --text-secondary: #8888aa;
    --accent: #9966ff;
    --accent-hover: #aa88ff;
    --danger: #ff4466;
    --success: #44ff88;
    --warning: #ffaa00;

    --font-body: 'Space Mono', monospace;
    --font-display: 'Exo 2', sans-serif;
}

/* Star HP indicators */
.hp-indicator::before {
    content: '\2B50'; /* Star */
    font-size: 1.25rem;
}

.hp-indicator--empty {
    filter: grayscale(1) opacity(0.3);
}

/* Star field background */
body {
    background-image:
        radial-gradient(white 1px, transparent 1px),
        radial-gradient(white 1px, transparent 1px);
    background-size: 100px 100px, 50px 50px;
    background-position: 0 0, 25px 25px;
}

/* Constellation dividers */
.nav {
    border-bottom: 1px solid var(--accent);
    box-shadow: 0 0 10px rgba(153, 102, 255, 0.3);
}
```

- [ ] **Step 2.3.4: Update modern.css with themed HP**

Update `static/css/themes/modern.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

/* static/css/themes/modern.css */
:root {
    --bg-primary: #f5f5f7;
    --bg-secondary: #ffffff;
    --text-primary: #1d1d1f;
    --text-secondary: #86868b;
    --accent: #5856d6;
    --accent-hover: #6e6cd8;
    --danger: #ff3b30;
    --success: #34c759;
    --warning: #ff9500;

    --font-body: 'Inter', system-ui, sans-serif;
    --font-display: 'Inter', system-ui, sans-serif;
}

/* Circle HP indicators */
.hp-indicator::before {
    content: '\25CF'; /* Filled circle */
    font-size: 1.25rem;
    color: var(--accent);
}

.hp-indicator--empty::before {
    content: '\25CB'; /* Empty circle */
    color: var(--text-secondary);
}

.hp-indicator--empty {
    opacity: 1;
    filter: none;
}

/* Card shadows */
.card {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn {
    border-radius: 20px;
}
```

- [ ] **Step 2.3.5: Update horror.css with themed HP**

Update `static/css/themes/horror.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Creepster&family=Special+Elite&display=swap');

/* static/css/themes/horror.css */
:root {
    --bg-primary: #0d0d0d;
    --bg-secondary: #1a0a0a;
    --text-primary: #e8e0e0;
    --text-secondary: #886666;
    --accent: #8b0000;
    --accent-hover: #a00000;
    --danger: #ff0000;
    --success: #228b22;
    --warning: #ff6600;

    --font-body: 'Special Elite', cursive;
    --font-display: 'Creepster', cursive;
}

/* Eldritch eye HP indicators */
.hp-indicator::before {
    content: '\1F441'; /* Eye */
    font-size: 1.25rem;
}

.hp-indicator--empty {
    filter: grayscale(1) opacity(0.3);
}

/* Blood red glow on accent elements */
.btn:hover {
    box-shadow: 0 0 15px rgba(139, 0, 0, 0.5);
}

/* Sharp rectangular borders */
.card {
    border: 2px solid var(--danger);
}
```

- [ ] **Step 2.3.6: Manually test each theme**

Test that fonts load and HP indicators display correctly for each theme.

- [ ] **Step 2.3.7: Commit**

```bash
git add static/css/themes/*.css
git commit -m "feat: add Google Fonts and themed HP indicators to all themes"
```

---

## Chunk 3: Frontend UX Improvements

### Task 3.1: Add Error Handling to Player Story Fetch

**Files:**
- Modify: `static/js/player.js:20-28`

- [ ] **Step 3.1.1: Update handleStateUpdate with error display**

In `static/js/player.js`, update the `handleStateUpdate` function:

```javascript
async function handleStateUpdate(data) {
    state = data.state;

    if (!state) {
        renderWaiting();
        return;
    }

    // Load story if needed or if story changed
    if (!story || story.id !== state.story_id) {
        try {
            story = await API.getStory(state.story_id);
            ThemeManager.setTheme(story.theme);
        } catch (e) {
            console.error('Failed to load story:', e);
            document.getElementById('player-view').innerHTML = `
                <div class="waiting-state">
                    <p style="color: var(--danger);">Error loading story. Please refresh.</p>
                </div>
            `;
            return;
        }
    }

    render();
}
```

- [ ] **Step 3.1.2: Commit**

```bash
git add static/js/player.js
git commit -m "fix: show error message when story fetch fails in player view"
```

---

### Task 3.2: Add Loading States and Button Disabling

**Files:**
- Modify: `static/js/run.js`
- Modify: `static/css/base.css`

- [ ] **Step 3.2.1: Add loading CSS to base.css**

At the end of `static/css/base.css`, add:

```css
/* Loading states */
.btn--loading {
    position: relative;
    color: transparent !important;
    pointer-events: none;
}

.btn--loading::after {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    top: 50%;
    left: 50%;
    margin-left: -8px;
    margin-top: -8px;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
```

- [ ] **Step 3.2.2: Add loading state to choice buttons in run.js**

In `static/js/run.js`, update `makeChoice`:

```javascript
async function makeChoice(index) {
    // Disable all choice buttons
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('btn--loading');
    });

    try {
        state = await API.makeChoice(index);
        const fresh = await API.getState();
        resolved = fresh.resolved;
        render();
    } catch (e) {
        // Re-enable buttons on error
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('btn--loading');
        });
        alert('Error: ' + e.message);
    }
}
```

- [ ] **Step 3.2.3: Add loading state to madlib submit**

In `static/js/run.js`, update `submitMadlib`:

```javascript
async function submitMadlib() {
    const input = document.getElementById('madlib-input');
    const submitBtn = document.querySelector('.madlib-view .btn');
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;

    // Disable input and button
    input.disabled = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('btn--loading');
    }

    try {
        state = await API.submitMadlib(value);
        if (state.character && state.status === 'running') {
            renderCharacterReveal();
        } else {
            const fresh = await API.getState();
            resolved = fresh.resolved;
            render();
        }
    } catch (e) {
        input.disabled = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn--loading');
        }
        alert('Error: ' + e.message);
    }
}
```

- [ ] **Step 3.2.4: Commit**

```bash
git add static/js/run.js static/css/base.css
git commit -m "feat: add loading states and disable buttons during API calls"
```

---

### Task 3.3: Add Unsaved Changes Warning to Editor

**Files:**
- Modify: `static/js/editor.js`

- [ ] **Step 3.3.1: Add dirty tracking to editor.js**

At the top of `static/js/editor.js`, after the existing variables, add:

```javascript
let story = null;
let currentView = null;
let currentSceneId = null;
let isDirty = false;  // Track unsaved changes
```

- [ ] **Step 3.3.2: Add beforeunload handler**

After the `loadStory` function, add:

```javascript
// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});
```

- [ ] **Step 3.3.3: Mark dirty on any change**

Update all the update functions to set `isDirty = true`. Add this line at the start of each:
- `updateScene()`
- `updateChoiceKind()`
- `updateChoiceText()`
- `updateChoiceItem()`
- `addConditional()`
- `removeConditional()`
- `updateConditionType()`
- `updateConditionOp()`
- `updateConditionValue()`
- `updateConditionSceneId()`
- `updateConditionOutcome()`
- `updateConditionText()`
- `addScene()`
- `deleteScene()`
- `updateMadlibPrompt()`
- `updateFieldLabel()`
- `updateStoryTitle()`
- `updateStartingHp()`
- `setTheme()`

For example, update `updateScene`:

```javascript
function updateScene() {
    isDirty = true;
    const scene = story.scenes.find(s => s.id === currentSceneId);
    // ... rest of function
}
```

- [ ] **Step 3.3.4: Clear dirty flag on save**

Update `saveStory`:

```javascript
async function saveStory() {
    try {
        await API.updateStory(storyId, story);
        isDirty = false;
        showToast();
    } catch (e) {
        alert('Failed to save: ' + e.message);
    }
}
```

- [ ] **Step 3.3.5: Manually test**

1. Make a change in the editor
2. Try to close the tab - should see a warning
3. Save the story
4. Try to close the tab - should NOT see a warning

- [ ] **Step 3.3.6: Commit**

```bash
git add static/js/editor.js
git commit -m "feat: warn before leaving editor with unsaved changes"
```

---

### Task 3.4: Add Drag Visual Feedback

**Files:**
- Modify: `static/pages/editor.html`
- Modify: `static/js/editor.js`

- [ ] **Step 3.4.1: Add drag indicator CSS to editor.html**

In `static/pages/editor.html`, add to the `<style>` section:

```css
.scene-item--drag-over {
    border-top: 2px solid var(--accent);
}

.scene-item--dragging {
    opacity: 0.5;
}
```

- [ ] **Step 3.4.2: Update setupDragDrop with visual feedback**

In `static/js/editor.js`, replace `setupDragDrop`:

```javascript
function setupDragDrop() {
    const items = document.querySelectorAll('.scene-item');
    items.forEach(item => {
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', item.dataset.id);
            item.classList.add('scene-item--dragging');
        });
        item.addEventListener('dragend', e => {
            item.classList.remove('scene-item--dragging');
            // Remove all drag-over indicators
            document.querySelectorAll('.scene-item--drag-over').forEach(el => {
                el.classList.remove('scene-item--drag-over');
            });
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            item.classList.add('scene-item--drag-over');
        });
        item.addEventListener('dragleave', e => {
            item.classList.remove('scene-item--drag-over');
        });
        item.addEventListener('drop', e => {
            e.preventDefault();
            item.classList.remove('scene-item--drag-over');
            const draggedId = e.dataTransfer.getData('text/plain');
            const targetId = item.dataset.id;
            if (draggedId === targetId) return;

            isDirty = true;
            const draggedIdx = story.scenes.findIndex(s => s.id === draggedId);
            const targetIdx = story.scenes.findIndex(s => s.id === targetId);
            const [dragged] = story.scenes.splice(draggedIdx, 1);
            story.scenes.splice(targetIdx, 0, dragged);
            renderSidebar();
        });
    });
}
```

- [ ] **Step 3.4.3: Commit**

```bash
git add static/pages/editor.html static/js/editor.js
git commit -m "feat: add visual feedback during scene drag and drop"
```

---

### Task 3.5: Add Variables Support to Choice Text

**Files:**
- Modify: `static/js/editor.js`

- [ ] **Step 3.5.1: Update renderChoiceBlock to include variable insertion**

In `static/js/editor.js`, replace `renderChoiceBlock`:

```javascript
function renderChoiceBlock(choice, index) {
    const kinds = ['damage', 'item', 'level'];
    const hasVariables = story.madlib_template.fields.length > 0;

    return `
        <div class="choice-block choice-block--${choice.kind}">
            <div class="choice-header">
                <select class="input" style="width: auto;" onchange="updateChoiceKind(${index}, this.value)">
                    ${kinds.map(k => `<option value="${k}" ${choice.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
                </select>
                ${choice.kind === 'item' ? `
                    <input class="input" style="width: 200px;" placeholder="Item name"
                           value="${escapeHtml(choice.item_name || '')}"
                           oninput="updateChoiceItem(${index}, this.value)">
                ` : ''}
            </div>
            <div style="display: flex; gap: var(--space-sm); align-items: center;">
                <input class="input" id="choice-text-${index}" placeholder="Choice text" value="${escapeHtml(choice.text)}"
                       oninput="updateChoiceText(${index}, this.value)" style="flex: 1;">
                ${hasVariables ? `
                    <div class="dropdown" style="position: relative;">
                        <button type="button" class="btn btn--secondary" onclick="toggleChoiceVars(${index})" style="padding: var(--space-xs) var(--space-sm);">+var</button>
                        <div id="choice-vars-${index}" class="dropdown-menu" style="display: none; position: absolute; right: 0; top: 100%; background: var(--bg-secondary); border: 1px solid var(--text-secondary); border-radius: var(--radius-sm); padding: var(--space-sm); z-index: 10; min-width: 150px;">
                            ${story.madlib_template.fields.map(f =>
                                `<div onclick="insertChoiceVariable(${index}, '${escapeAttr(f.key)}')"
                                      style="cursor: pointer; padding: var(--space-xs); border-radius: var(--radius-sm);"
                                      onmouseover="this.style.background='var(--bg-primary)'"
                                      onmouseout="this.style.background='transparent'">{${escapeHtml(f.key)}}</div>`
                            ).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}
```

- [ ] **Step 3.5.2: Add helper functions for choice variable insertion**

In `static/js/editor.js`, add after `insertVariable`:

```javascript
function toggleChoiceVars(index) {
    const menu = document.getElementById(`choice-vars-${index}`);
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

function insertChoiceVariable(index, key) {
    const input = document.getElementById(`choice-text-${index}`);
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    input.value = text.slice(0, start) + `{${key}}` + text.slice(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + key.length + 2;
    updateChoiceText(index, input.value);

    // Hide the dropdown
    const menu = document.getElementById(`choice-vars-${index}`);
    if (menu) menu.style.display = 'none';
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});
```

- [ ] **Step 3.5.3: Manually test**

1. Create a story with mad lib fields
2. Edit a scene
3. Click "+var" button next to a choice text
4. Select a variable to insert

- [ ] **Step 3.5.4: Commit**

```bash
git add static/js/editor.js
git commit -m "feat: add variable insertion support for choice text"
```

---

## Chunk 4: Fix Remaining UI Issues

### Task 4.1: Fix Conditional Row Grid for Scene Outcome

**Files:**
- Modify: `static/pages/editor.html`
- Modify: `static/js/editor.js`

- [ ] **Step 4.1.1: Update conditional row CSS for flexible layout**

In `static/pages/editor.html`, replace the `.conditional-row` CSS:

```css
.conditional-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
    align-items: center;
}

.conditional-row > select,
.conditional-row > input[type="number"] {
    width: auto;
    min-width: 80px;
}

.conditional-row > input[type="text"],
.conditional-row > input:not([type]) {
    flex: 1;
    min-width: 150px;
}

.conditional-row > .btn {
    flex-shrink: 0;
}
```

- [ ] **Step 4.1.2: Update renderConditionalRow for better structure**

In `static/js/editor.js`, update `renderConditionalRow`:

```javascript
function renderConditionalRow(ct, index) {
    const cond = ct.condition;
    return `
        <div class="conditional-row">
            <select class="input" onchange="updateConditionType(${index}, this.value)" style="width: 130px;">
                <option value="hp" ${cond.type === 'hp' ? 'selected' : ''}>HP</option>
                <option value="items" ${cond.type === 'items' ? 'selected' : ''}>Items</option>
                <option value="level" ${cond.type === 'level' ? 'selected' : ''}>Level</option>
                <option value="scene_outcome" ${cond.type === 'scene_outcome' ? 'selected' : ''}>Scene Outcome</option>
            </select>
            ${cond.type === 'scene_outcome' ? `
                <select class="input" onchange="updateConditionSceneId(${index}, this.value)" style="width: 150px;">
                    ${story.scenes.map(s => `<option value="${escapeAttr(s.id)}" ${cond.scene_id === s.id ? 'selected' : ''}>${escapeHtml(s.title || s.id)}</option>`).join('')}
                </select>
                <select class="input" onchange="updateConditionOutcome(${index}, this.value)" style="width: 100px;">
                    <option value="damage" ${cond.outcome === 'damage' ? 'selected' : ''}>damage</option>
                    <option value="item" ${cond.outcome === 'item' ? 'selected' : ''}>item</option>
                    <option value="level" ${cond.outcome === 'level' ? 'selected' : ''}>level</option>
                </select>
            ` : `
                <select class="input" onchange="updateConditionOp(${index}, this.value)" style="width: 70px;">
                    <option value="lte" ${cond.op === 'lte' ? 'selected' : ''}>&le;</option>
                    <option value="gte" ${cond.op === 'gte' ? 'selected' : ''}>&ge;</option>
                    <option value="eq" ${cond.op === 'eq' ? 'selected' : ''}>=</option>
                </select>
                <input class="input" type="number" value="${cond.value !== null ? cond.value : 0}"
                       onchange="updateConditionValue(${index}, this.value)" style="width: 70px;">
            `}
            <input class="input" placeholder="Text to show" value="${escapeHtml(ct.text)}"
                   oninput="updateConditionText(${index}, this.value)">
            <button class="btn btn--danger" onclick="removeConditional(${index})" title="Remove">×</button>
        </div>
    `;
}
```

- [ ] **Step 4.1.3: Commit**

```bash
git add static/pages/editor.html static/js/editor.js
git commit -m "fix: improve conditional row layout for scene_outcome type"
```

---

### Task 4.2: Add Edge Case Tests

**Files:**
- Modify: `tests/test_state_api.py`

- [ ] **Step 4.2.1: Add test for choice_index out of bounds**

Add to `tests/test_state_api.py`:

```python
def test_choice_index_out_of_bounds(client):
    """Choice index >= number of choices should return 422."""
    story_id = make_story(client, with_madlibs=False)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 99})
    assert resp.status_code == 422
    assert "choice" in resp.json()["detail"].lower()


def test_choice_index_negative(client):
    """Negative choice index should return 422."""
    story_id = make_story(client, with_madlibs=False)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": -1})
    assert resp.status_code == 422
```

- [ ] **Step 4.2.2: Run new tests**

Run: `uv run pytest tests/test_state_api.py::test_choice_index_out_of_bounds tests/test_state_api.py::test_choice_index_negative -v`
Expected: PASS (validation already exists)

- [ ] **Step 4.2.3: Add test for starting story with no scenes**

Add to `tests/test_state_api.py`:

```python
def test_start_session_no_scenes(client):
    """Starting a story with no scenes should return 422."""
    resp = client.post("/api/stories", json={"title": "Empty Story"})
    story_id = resp.json()["id"]
    # Story has no scenes by default

    resp = client.post("/api/state/start", json={"story_id": story_id})
    assert resp.status_code == 422
    assert "scene" in resp.json()["detail"].lower()
```

- [ ] **Step 4.2.4: Run new test**

Run: `uv run pytest tests/test_state_api.py::test_start_session_no_scenes -v`
Expected: PASS (validation already exists)

- [ ] **Step 4.2.5: Commit**

```bash
git add tests/test_state_api.py
git commit -m "test: add edge case tests for choice validation"
```

---

## Final Verification

- [ ] **Run all tests**

Run: `uv run pytest -v`
Expected: All tests PASS

- [ ] **Manual smoke test**

1. Start the server: `uv run python main.py`
2. Open http://localhost:8000
3. Create a new story with all 5 themes
4. Add scenes with mad libs and conditional text
5. Run the story on the run view
6. Open player view on another tab/device
7. Complete a full playthrough

- [ ] **Final commit with all changes**

If any uncommitted changes remain:

```bash
git status
git add -A
git commit -m "chore: final quality fixes cleanup"
```
