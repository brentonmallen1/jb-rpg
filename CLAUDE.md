# J&B's RPG — Project Guide

## What This Is

A TTRPG companion app for playing story-driven tabletop adventures. One storyteller runs it locally; players connect on their own devices. Two modes: **Editor** (build stories) and **Run** (play through them).

Full design spec: `docs/superpowers/specs/2026-03-16-jb-rpg-design.md`

## Virtual Environment

Use the uv python virtual environment and package manager

---

## Tech Stack

- **Backend:** Python, FastAPI
- **Frontend:** React + TypeScript + Vite
- **Persistence:** Flat JSON files (`stories/` directory + `state.json`)
- **Real-time:** Server-Sent Events (SSE) via `GET /api/events`
- **No database.** No authentication.

---

## Project Structure

```
jb-rpg/
├── main.py                    # Entry point (uvicorn main:app); the app is in app/
├── app/
│   ├── main.py                # FastAPI app, middleware, routers, static mounts
│   ├── models.py              # Pydantic models; public_state() strips private fields
│   ├── engine.py              # Pure game rules: transitions, resolved content, story_problems
│   ├── storage.py             # Atomic JSON writes; stories + state.json
│   ├── auth.py                # Admin Basic auth, storyteller token (hashed), player session id
│   ├── sse.py                 # Connections by role, broadcast, heartbeat, end_session
│   └── routes/                # stories.py, session.py, pages.py
├── data/                      # DATA_DIR: stories/*.json + state.json (only demo-* tracked)
├── tests/                     # pytest; conftest.py has the client fixture + start() helper
├── frontend/src/
│   ├── pages/                 # Library, Editor (shell) + editor/*, Run (shell) + run/*, Player, DevMoments (dev only)
│   ├── components/            # Modal, MomentLayer, Atmosphere, HealthMeter, CorruptText, Icons…
│   ├── hooks/                 # api.ts (request helper), useSSE, useMoments, useHotkeys, useTheme…
│   ├── lib/                   # moments.ts, themes.ts (moods, health names), story.ts, outcomes.ts
│   ├── context/               # GameProvider (GameContext.tsx) + useGame.ts
│   └── styles/                # base, stage (storyteller), phone (player), moments, atmosphere, health, themes/
├── docs/                      # audit + overnight log + design spec/plans
├── .impeccable.md             # Design context: users, tone, principles
├── Dockerfile / docker-compose.yml
└── justfile
```

---

## Development Workflow

```bash
# Install all dependencies
just install

# Run in separate terminals:
just backend       # FastAPI on http://localhost:8000
just frontend-dev  # Vite dev server on http://localhost:5173

# Or see help:
just dev
```

The Vite dev server proxies `/api/*` requests to the FastAPI backend, providing hot module replacement (HMR) for instant updates.

### Environment Variables

Copy `.env.example` to `.env` and adjust as needed:
- `BACKEND_PORT` — FastAPI server port (default 8000)
- `FRONTEND_PORT` — Vite dev server port (default 5173)
- `DATA_DIR` — data directory location
- `ADMIN_USER` / `ADMIN_PASSWORD` — HTTP Basic auth for the Library, Editor and Run pages and story APIs (empty = open)
- `AUTH_DISABLED` — `true` bypasses admin auth and player session checks (local dev only)
- `ALLOWED_ORIGINS` — CORS origins, comma-separated
- `BASE_URL` — public origin for player links behind a reverse proxy

Tests: `just test` (pytest) and `just e2e` (storyteller + player in real browsers via Playwright, on spare ports with throwaway data; run it after UI or session changes). CI (`.github/workflows/ci.yml`) runs pytest, eslint and `npm run build`; keep all three green.

---

## Key Architectural Rules

- **State is always `state.json`** — write to disk on every mutation, never hold state only in memory
- **Scene tracking uses `scene_id` strings**, not array indices
- **SSE broadcasts the full state payload** on every change — clients are dumb consumers, no client-side condition evaluation
- **Themes travel with the story** — stored in the story JSON, not a global setting
- **Variable injection (`{field_key}`)** happens server-side before broadcasting, using `state.character.fields`
- **Back button replays from history** using stored `damage_amount`/`item_name` — never re-reads from the story file
- **Players never receive the story.** Everything a player sees comes from `resolved` in the SSE payload (`scene_text`, `theme`, `visible_choices`). Choice outcomes, `result_text`, and story structure stay server-side/storyteller-only
- **Players don't know where they are in the story** — no scene counts or progress on any player-facing screen (phones or presentation mode); only the storyteller's private view shows progress (design rule, see `.impeccable.md`). `resolved.finale` is how players learn the end has come
- **Sessions use a snapshot of the story** (`state.story`, taken at `/start`, never sent to clients). Edits to a story apply to the next game
- **Presentation mode** (storyteller, `P`) is player-facing: anything with `.storyteller-only` is hidden there

---

## Access Model

Three layers, all lightweight (no user accounts):
1. **Admin (HTTP Basic)** — `verify_admin` + `AdminPagesMiddleware` protect story CRUD, `/api/state/start`, and the `/`, `/editor`, `/run` pages. Only `AUTH_DISABLED=true` turns it off; with no `ADMIN_USER`/`ADMIN_PASSWORD`, a login is generated on first run, saved in `DATA_DIR/admin.json`, and logged at startup.
2. **Storyteller token** — `/api/state/start` returns a token (kept in memory server-side, `sessionStorage` client-side). Every other `POST /api/state/*` requires it in `X-Session-Token`; SSE takes it as `?token=`.
3. **Player session id** — players join via `/player/{session_id}`; SSE and `GET /api/state` take it as `?s=`. `GET /api/session/check?s=` validates it without revealing the id. Never expose `session_id` from a public endpoint.

On `/restart`, the server sends `session_ended` and closes every SSE stream so clients re-authenticate.

Always run uvicorn with `--timeout-graceful-shutdown` (the justfile and Dockerfile do): SSE streams never close on their own, so without it a stopped or reloading server lingers and keeps feeding clients.

---

## API Conventions

All state mutation endpoints are `POST /api/state/*`. They:
1. Validate the action is legal for the current `status`
2. Mutate state
3. Write `state.json`
4. Broadcast updated SSE payload to all connected clients
5. Return the updated state

Return `409 Conflict` if an action is called in the wrong status (e.g. `choice` when `status == game_over`).

---

## Session Status Flow

```
(no state.json)
      ↓  POST /api/state/start            (skips steps whose content the story doesn't have)
madlib_in_progress   ⇄ POST /madlib, /madlib-back
      ↓  (last answer)
character_reveal     → POST /proceed-from-character
      ↓
opening_scene_active → POST /opening-choice   (only if story.opening_scene)
      ↓
running  ⇄  awaiting_scene_selection          (non_linear stories: POST /select-scene)
   │  POST /reveal-choices (shuffle; ?show_to_players=true pushes to phones)
   │  POST /choice, /back
      ↓
game_over  →  POST /finish  →  outcome: victory | defeat
      ↓
POST /restart  →  (back to no state)
```

**HP defeat:** auto-sets `status: game_over`, `outcome: "defeat"` immediately — no `/finish` call needed.
**Finale:** either a scene with `is_finale: true` (storyteller calls `/finish` from `running`), or the last linear scene, which sets `game_over` with `outcome: null`. Both await the physical d20 roll.
**Choice reveal:** `shuffled_indices` maps the visual order to `scene.choices`; history stores the original index. Any scene change (choice, back, select-scene) must reset `shuffled_indices` and `choices_revealed`.

---

## Themes

Six themes: `cyberpunk`, `fantasy`, `deep_space`, `modern`, `horror`, `insanity` (`ThemeName`; frontend list is `THEMES` in `types/index.ts`). `modern` is also the app's own chrome (Library, Editor).

- `styles/themes/<theme>.css` sets tokens on the `.<theme>` class: colours (dark + a deliberate `[data-mode="light"]` set), `--font-display`, `--font-body`, `--font-reading` (long scene text). Fonts are self-hosted via `@fontsource` (no network at game time). Any element with the theme class gets its look (Library covers use this).
- Layout CSS (`stage.css`, `phone.css`) only uses tokens, so themes restyle everything without layout changes.
- `lib/themes.ts`: `HEALTH_LABEL` (Candles, Sight, Integrity, Hull, Sanity, Health) and `MOODS` per theme. `HealthMeter` draws health in each theme's iconography.
- **Moods**: `Scene.mood` (set in the Editor, or unset = automatic). The server sends `resolved.mood` + `resolved.mood_seed`; `moodFor()` picks the theme's mood. `Atmosphere` renders the backdrop.
- **Moments** (`lib/moments.ts`): `diffMoments(prev, next)` turns SSE state changes into dramatic beats played by `MomentLayer` on every screen in sync; copy and victory/defeat endings are themed. Effects level (full/subtle/off) is per device; respect `prefers-reduced-motion`; never more than 3 flashes per second.
- **Insanity** text corruption (`CorruptText`) scales with health lost; screen readers get clean text.
- Tune visuals at `/dev/moments` (dev builds only).

## Editor

`pages/Editor.tsx` holds the story in `useUndoable` (⌘Z/⇧⌘Z, typing bursts merge into one step), autosaves, and lays out three columns: `EditorNav` (sections, drag-to-reorder scenes with ready/draft/problem dots), the selected panel (`StoryPanel`, `CharactersPanel`, `OpeningPanel`, `ScenePanel`), and `PreviewPane` (the selection rendered with the stage/phone styles in the story's theme, filled with per-device sample answers). Pure edit helpers live in `lib/storyEdit.ts`. Story problems come from `GET /api/stories/{id}/problems` as `{message, area, scene_id, field, index}` so panels can flag the exact field. Playtest saves, starts a game of the draft and opens the stage.

---

## Mad Libs

- Template uses `{field_key}` placeholders in a prompt string
- Fields have a `key` (used in templates) and a `label` (the prompt shown to players)
- Character fields are stored in `state.character.fields` after creation
- The same `{field_key}` syntax works in scene text, conditional text, and choice text
- Unknown `{field_key}` tokens are left unreplaced silently
- If `madlib_template.fields` is empty, character creation is skipped entirely

---

## Condition Types

Conditions in `conditional_text` use a structured object, not strings:
- `{ "type": "hp", "op": "lte"|"gte"|"eq", "value": N }` — compares current HP
- `{ "type": "items", "op": "lte"|"gte"|"eq", "value": N }` — compares `len(state.items)`
- `{ "type": "level", "op": "lte"|"gte"|"eq", "value": N }` — compares current level
- `{ "type": "scene_outcome", "scene_id": "...", "outcome": "damage"|"item"|"level" }` — checks history; unplayed scenes evaluate to `false`

---

## Light/Dark Mode

Global toggle, stored in `localStorage` on the client. Independent of theme. Both editor and run/player views support it.

---

## Do Not

- Do not add a database
- Do not add user accounts or logins beyond the access model above
- Do not make damage amounts configurable (always 1 HP) — `Choice.amount` exists for forward-compatibility only
- Do not store `player_count` in `state.json` or return it from `GET /api/state` (SSE only)
