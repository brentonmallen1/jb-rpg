# J&B's RPG — Design Spec
_Date: 2026-03-16_

## Overview

A story-driven TTRPG companion app for a group playing together around a table. One storyteller runs the app on their laptop; players connect on their own devices (phones/tablets) to a shared player view. The app has two modes: **Editor** (build stories) and **Run** (play through them).

---

## Game Rules (for reference)

- Players share one character, built collaboratively via a mad libs game before play begins
- The story is played scene by scene; each scene has a decision maker (rotated at the table, not tracked by the app)
- Each scene presents a narrative and 3 choices; each choice results in one of: damage (−HP), gain item, or level up
- Players start with configurable HP (default 3), level 1, and no items
- Each item grants +1 to the final boss roll; each level grants an additional roll attempt
- The boss fight uses physical dice; the app shows the group their bonuses. Roll 20+ to win.
- If HP reaches 0, the group loses

---

## Architecture

A single **FastAPI** Python application run locally by the storyteller. It serves static HTML/CSS/JS and a REST API. No database — all persistence is flat files.

```
jb-rpg/
├── main.py                    # FastAPI app — all routes and SSE endpoint
├── stories/                   # One JSON file per story
│   └── {story-id}.json
├── state.json                 # Active session state (persists across reloads)
├── static/
│   ├── css/
│   │   └── themes/            # One CSS file per theme
│   ├── js/
│   └── pages/
│       ├── index.html         # Story library
│       ├── editor.html        # Story editor
│       ├── run.html           # Storyteller run/control view
│       └── player.html        # Player status view
```

**Routes:**
- `GET /` — story library
- `GET /editor?story={id}` — story editor
- `GET /run?story={id}` — storyteller run view
- `GET /player` — player status view (always reflects active session)
- `GET /api/stories` — list all stories
- `GET /api/stories/{id}` — get story JSON
- `POST /api/stories` — create story; body: `{ "title": str }` → returns full blank story with generated id
- `PUT /api/stories/{id}` — save full story JSON (including reordered scenes); body: full `Story` object
- `DELETE /api/stories/{id}` — delete story; if this story is the active session, `state.json` is also cleared
- `GET /api/state` — get current session state + resolved scene text (see SSE payload below)
- `POST /api/state/start` — start a new run; body: `{ "story_id": str }` → creates fresh `GameState` with `status: madlib_in_progress`, writes `state.json`, broadcasts via SSE
- `POST /api/state/madlib` — submit one mad libs answer; body: `{ "key": str, "value": str }` → advances `madlib_step`; when all fields answered, sets `status: running`, builds `character`, broadcasts via SSE. If `madlib_template.fields` is empty, `POST /api/state/start` skips directly to `status: running` and sets `character: null` — no mad libs prompts are shown
- `POST /api/state/choice` — apply a choice; body: `{ "choice_index": int }` (0, 1, or 2) → updates state, appends history entry, broadcasts via SSE; if last scene, sets `status: game_over`
- `POST /api/state/back` — undo last choice; no body → pops history, replays to recalculate state, broadcasts via SSE; if history is empty, no-op
- `POST /api/state/restart` — reset session; no body → clears `state.json`, broadcasts cleared state via SSE
- `POST /api/state/finish` — record final outcome; body: `{ "outcome": "victory" | "defeat" }` → sets `status: game_over`, `outcome` field, broadcasts via SSE
- `GET /api/events` — SSE stream for real-time updates

**Real-time sync:** The player view (`/player`) connects to `/api/events` via Server-Sent Events. Every state change pushes a full payload to all connected clients. The storyteller's `/run` page also connects to SSE to keep its status bar in sync; it does not rely on SSE to drive its primary scene UI (which it controls directly). Clients should implement exponential-backoff reconnection on disconnect.

**SSE payload format:** Every event is a `data:` line containing a JSON object:
```json
{
  "type": "state",
  "state": { /* full GameState */ },
  "resolved": {
    "scene_text": "Full rendered scene text with conditional text appended and mad libs variables substituted.",
    "character_description": "Reginald Bumble is a chimney sweep..."
  },
  "connected_count": 3
}
```
The `resolved` object is pre-rendered server-side so clients need no logic to evaluate conditions or substitute variables. `connected_count` is the current number of active SSE connections tracked in-memory; it is accurate in SSE events but **excluded from `GET /api/state`** (which returns the same shape minus `connected_count`). The server tracks connections with a simple in-memory counter incremented/decremented on connect/disconnect.

**Blank story defaults:** A new story created via `POST /api/stories` starts with: zero scenes, the Cyberpunk theme, `starting_hp: 3`, and an empty mad libs template (`prompt: ""`, `fields: []`).

**Note on local network trust:** This app runs on a trusted local network (the storyteller's laptop). No authentication is implemented — any device on the network can call any API endpoint. This is intentional.

---

## Data Models

### Story JSON (`stories/{id}.json`)

```json
{
  "id": "observatory",
  "title": "The Observatory",
  "theme": "fantasy",
  "settings": {
    "starting_hp": 3
  },
  "madlib_template": {
    "prompt": "{name} is a {occupation} with a tendency to {quirk}. They suffer from {malady} but are known for their {trait}.",
    "fields": [
      { "key": "name",       "label": "Give them a first and last name" },
      { "key": "occupation", "label": "Name an occupation" },
      { "key": "quirk",      "label": "Name a personality quirk" },
      { "key": "malady",     "label": "Name a malady" },
      { "key": "trait",      "label": "Name a positive trait" }
    ]
  },
  "scenes": [
    {
      "id": "scene_1",
      "title": "The Entrance",
      "base_text": "You enter the old observatory as thunder rolls outside.",
      "conditional_text": [
        { "condition": { "type": "hp",     "op": "lte", "value": 1 }, "text": "Your injuries make every step ache." },
        { "condition": { "type": "items",  "op": "gte", "value": 1 }, "text": "Your earlier find gives you some confidence." },
        { "condition": { "type": "level",  "op": "gte", "value": 2 }, "text": "You recognize the pattern in the machinery immediately." },
        { "condition": { "type": "scene_outcome", "scene_id": "scene_1", "outcome": "item" }, "text": "The item you found earlier rattles in your pack." }
      ],
      "choices": [
        { "kind": "damage", "text": "Climb the broken stairs",    "amount": 1 },
        { "kind": "item",   "text": "Search the supply cabinet",  "item_name": "Brass Compass", "amount": 1 },
        { "kind": "level",  "text": "Study the star charts",      "amount": 1 }
      ]
    }
  ]
}
```

**Mad libs variable injection:** Any `{field_key}` in `base_text`, `conditional_text`, or choice `text` is substituted at render time using the character's mad libs answers. Example: `"Because of their {malady}, they got distracted..."` → `"Because of their allergies, they got distracted..."`

### Session State (`state.json`)

```json
{
  "story_id": "observatory",
  "status": "running",
  "madlib_step": 0,
  "madlib_answers": {},
  "current_scene_id": "scene_4",
  "hp": 2,
  "level": 2,
  "items": ["Brass Compass", "Worn Map"],
  "history": [
    { "scene_id": "scene_1", "outcome": "item",   "choice_index": 1, "item_name": "Brass Compass", "damage_amount": 1 },
    { "scene_id": "scene_2", "outcome": "level",  "choice_index": 2, "item_name": null,            "damage_amount": 1 },
    { "scene_id": "scene_3", "outcome": "damage", "choice_index": 0, "item_name": null,            "damage_amount": 1 }
  ],
  "character": {
    "name": "Reginald Bumble",
    "description": "Reginald Bumble is a chimney sweep with a tendency to talk to strangers on trains. They suffer from allergies but are known for their relentless optimism.",
    "fields": {
      "name":       "Reginald Bumble",
      "occupation": "chimney sweep",
      "quirk":      "talk to strangers on trains",
      "malady":     "allergies",
      "trait":      "relentless optimism"
    }
  },
  "outcome": null
}
```

`history` is the ordered list of scene outcomes — powers the back button all the way to the beginning and drives `scene_outcome` conditions.

---

## Pydantic Models

```python
class ConditionType(str, Enum):
    HP = "hp"
    ITEMS = "items"
    LEVEL = "level"
    SCENE_OUTCOME = "scene_outcome"

class Condition(BaseModel):
    type: ConditionType
    op: Optional[Literal["lte", "gte", "eq"]] = None   # for hp/items/level
    value: Optional[int] = None                          # for hp/items/level
    scene_id: Optional[str] = None                       # for scene_outcome
    outcome: Optional[Literal["damage", "item", "level"]] = None  # for scene_outcome

class ConditionalText(BaseModel):
    condition: Condition
    text: str

class ChoiceKind(str, Enum):
    DAMAGE = "damage"
    ITEM = "item"
    LEVEL = "level"

class Choice(BaseModel):
    kind: ChoiceKind
    text: str
    amount: int = 1
    item_name: Optional[str] = None  # required when kind == ITEM

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

class ThemeName(str, Enum):
    CYBERPUNK = "cyberpunk"
    FANTASY = "fantasy"
    DEEP_SPACE = "deep_space"
    MODERN = "modern"
    HORROR = "horror"

class SessionStatus(str, Enum):
    MADLIB_IN_PROGRESS = "madlib_in_progress"   # mad libs flow underway
    RUNNING = "running"                           # scenes being played
    GAME_OVER = "game_over"                       # victory or defeat recorded

class HistoryEntry(BaseModel):
    scene_id: str
    outcome: ChoiceKind
    choice_index: int        # 0/1/2 — which of the 3 choices was made
    item_name: Optional[str] = None  # populated when outcome == ITEM
    damage_amount: int = 1   # populated when outcome == DAMAGE

class Character(BaseModel):
    name: str
    description: str
    fields: dict[str, str]

class GameState(BaseModel):
    story_id: str
    status: SessionStatus = SessionStatus.MADLIB_IN_PROGRESS
    madlib_step: int = 0              # index into madlib_template.fields; only used during MADLIB_IN_PROGRESS
    madlib_answers: dict[str, str] = {}  # accumulated answers during mad libs flow
    current_scene_id: str             # set to story.scenes[0].id at start; advances sequentially after each choice
    hp: int
    level: int = 1
    items: list[str] = []
    history: list[HistoryEntry] = []
    character: Optional[Character] = None  # populated after mad libs completes
    outcome: Optional[Literal["victory", "defeat"]] = None  # set when status == GAME_OVER
```

---

## Pages & Views

### Story Library (`/`)
- List of all saved stories (title, scene count, last modified, theme badge)
- Actions: Edit, Run, Delete per story
- "New Story" button — creates a blank story and navigates to editor
- Light/dark mode toggle in nav (global setting, persisted in localStorage)

### Story Editor (`/editor?story={id}`)

**Layout:** Collapsible sidebar (scene list + setup links) + main editing panel.

**Sidebar:**
- Ordered list of scenes (drag to reorder)
- "Add Scene" button
- "Mad Libs Template" link
- "Story Settings" link (starting HP, theme picker)

**Scene editing panel:**
- Scene title field
- Scene text textarea (with "Available variables" collapsible panel showing all `{field_key}` options for the story's mad libs template — click a key to insert it at cursor)
- Conditional text builder: structured condition rows (condition type dropdown → value inputs) + text field; add/remove rows
- Three choice blocks, each with: kind selector (damage / item / level), outcome details (HP amount, item name, level amount), and choice text field
- Save / Discard buttons

**Mad libs template editor:**
- Template text textarea (type `{key}` to define a placeholder)
- Auto-detected fields list below — each field shows its key and an editable "prompt" label
- Built-in starter templates to load and modify

**Story settings panel:**
- Starting HP (number input)
- Theme picker (visual swatches: Cyberpunk, Fantasy, Deep Space, Modern, Horror)

### Storyteller Run View (`/run?story={id}`)

**Layout:** Status bar (top) + scene panel (center) + controls (bottom).

**Status bar:** Story title · ♥ HP indicators · Level · Item count · Scene X of Y · Connected player count (SSE)

**Scene panel:**
- Scene number + title
- Scene text (mad libs variables resolved, conditional text appended if conditions met)
- Three choice buttons — color coded (red = damage, green = item, purple = level up), showing outcome details (−1 HP / "Brass Compass" / Level Up)
- Previous scene reminder (smaller, below choices): scene title + outcome

**Controls:** Back button · Restart button · Character description reference (collapsible)

**Mad libs flow (before first scene):** Prompt-by-prompt character creation — current prompt displayed large, text input, collected answers shown below, progress indicator. On completion: character reveal screen (filled description with contributed words highlighted) → "Begin the Story" button.

**Finale screen (after last scene):** Full state summary (HP, level, items list) + roll instructions (number of rolls, bonus to add, target number) + Victory / Defeated buttons to close out the session.

### Player View (`/player`)

Live-updating via SSE — no manual refresh needed.

- Character name (tappable → modal showing full character description)
- HP indicators (themed: lanterns / power chips / stars / hearts / eyes)
- Level + item count stat blocks
- Item inventory list
- Story progress bar + scene X of Y
- Themed per the active story's theme setting

---

## Themes

Five themes, each implemented as a CSS file. Theme is stored in the story JSON and travels with it — the player view automatically matches.

| Theme | Palette | HP indicator | Feel |
|---|---|---|---|
| **Cyberpunk** | Cyan/magenta on near-black, clipped corners, scanlines | Memory chips | HUD / Cyberpunk 2077 |
| **Fantasy** | Amber/gold on dark wood, corner ornaments, serif | Hanging lanterns (SVG) | Inn & tavern |
| **Deep Space** | Violet/purple on void-black, star field, constellation dividers | Gold stars (SVG) | NASA mission log |
| **Modern** | Indigo/green on light grey, card shadows, rounded | Filled circles | Clean SaaS |
| **Horror** | Blood red on near-black, sharp rectangular borders, glow | Glowing eldritch eyes | Lovecraftian |

Light/dark mode is a global toggle (localStorage) independent of theme.

---

## Settings

- **Starting HP** — per story, default 3
- **Theme** — per story, default Cyberpunk
- **Light/dark mode** — global, persisted in localStorage

---

## Key Behaviors

- **Variable injection:** Before rendering any text, substitute all `{field_key}` tokens with values from `state.character.fields`. If a `{field_key}` has no matching entry in `fields` (e.g. a typo in the story), leave the token unreplaced — silent passthrough, no error.

- **Condition evaluation:** Evaluated server-side before broadcasting. Rules:
  - `hp`, `items`, `level` conditions: `items` count = `len(state.items)`. Supported ops: `lte` (≤), `gte` (≥), `eq` (=).
  - `scene_outcome` condition: looks up `scene_id` in `history`. If the scene has not been played yet, the condition evaluates to `false` silently.
  - Matching `conditional_text` entries are appended to `base_text` in order, separated by a space.

- **Scene tracking:** State always tracks the current scene by `scene_id` (not index). Scene order within the story is determined at run-start by the current order of the `scenes` array and does not change mid-session even if the editor reorders scenes. Scene advancement is always sequential — after a choice, `current_scene_id` advances to the next scene in the `scenes` array by position. No branching; there is no `next_scene_id` on `Choice`.

- **`current_scene_id` at session start:** When `POST /api/state/start` creates a fresh `GameState` with `status: madlib_in_progress`, `current_scene_id` is set to the `id` of the first scene in the story's `scenes` array. It does not change until the first choice is made.

- **Back button:** Is a **no-op** if `status` is `madlib_in_progress` — mad libs cannot be rewound via back. When `status` is `running` or `game_over`: pops the last `HistoryEntry` from `history`; recalculates `hp`, `level`, and `items` from scratch by replaying the remaining history entries (using each entry's stored `damage_amount` and `item_name` — **not** re-reading from the story file, so edits to the story mid-session do not corrupt replay); sets `current_scene_id` to the popped entry's `scene_id`; sets `status` back to `running` if it was `game_over`. If `history` is empty and `status` is `running`, no-op. Writes state and broadcasts.

- **HP defeat condition:** After applying a choice in `POST /api/state/choice`, if the resulting `hp ≤ 0`, `status` is immediately set to `game_over` and `outcome` is set to `"defeat"` automatically — no call to `POST /api/state/finish` needed. The scene does not advance. The finale/summary screen is shown immediately.

- **Guard against double-submission:** `POST /api/state/choice` returns `409 Conflict` if `status` is already `game_over`. The run view disables choice buttons once `game_over` is reached to prevent this in normal use.

- **Finale trigger:** After `POST /api/state/choice` is applied (and HP > 0), if the choice was made on the last scene in the story's `scenes` array, `status` is set to `game_over` and `outcome` is left `null`. `current_scene_id` is not advanced. The storyteller then calls `POST /api/state/finish` with `"victory"` or `"defeat"` after the physical boss roll. The finale screen is shown whenever `status == game_over`; when `outcome` is `null`, it shows the roll instructions and awaits the storyteller's call; once `outcome` is set, it shows the final result.

- **Finale roll instructions:** `level` grants extra roll attempts. A group at level N gets N rolls total (level 1 = 1 roll, level 2 = 2 rolls, etc.). Each item grants +1 to every roll. Damage amounts are always 1 HP per damage choice — `Choice.amount` and `HistoryEntry.damage_amount` are always 1; the field exists for forward-compatibility but the editor does not expose it. Target is 20+. Roll instructions shown as: "You have N roll(s) · Add +M to each roll · Need 20 or higher."

- **Game over persistence:** When `POST /api/state/finish` is called, `outcome` ("victory" or "defeat") is written to `state.json`. The session remains readable (for the summary screen) until `restart` is explicitly called.

- **State persistence:** Every state mutation writes `state.json` immediately — reloading never loses progress.

- **Start over:** `POST /api/state/restart` clears `state.json` (writes empty `{}`), broadcasts a null state event so all clients return to a waiting/idle screen.

- **SSE broadcast:** All connected clients receive the same full payload on every mutation. The server maintains an in-memory set of active SSE connections; `connected_count` in the payload reflects the live count.

- **Editor scene reorder:** Drag-to-reorder in the sidebar is persisted immediately via `PUT /api/stories/{id}` with the full updated story payload (scenes in new order). No separate reorder endpoint.
