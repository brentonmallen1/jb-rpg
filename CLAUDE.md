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
├── main.py                    # FastAPI app — all routes and SSE
├── stories/                   # One JSON file per story
├── state.json                 # Active session state
├── .env.example               # Environment variable template
├── frontend/                  # React app (Vite + TypeScript)
│   ├── package.json
│   ├── vite.config.ts         # Vite config with API proxy
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/             # Library, Editor, Run, Player
│   │   ├── components/
│   │   ├── hooks/             # useSSE, useTheme, api.ts
│   │   ├── context/           # GameContext
│   │   ├── types/             # TypeScript types
│   │   └── styles/            # CSS (base + themes)
│   └── dist/                  # Built output (gitignored)
├── static/                    # Legacy vanilla JS (deprecated)
├── Dockerfile                 # Multi-stage build (Node + Python)
├── docker-compose.yml
└── justfile                   # Development commands
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

Tests: `just test` (pytest). CI (`.github/workflows/ci.yml`) runs pytest, eslint and `npm run build`; keep all three green.

---

## Key Architectural Rules

- **State is always `state.json`** — write to disk on every mutation, never hold state only in memory
- **Scene tracking uses `scene_id` strings**, not array indices
- **SSE broadcasts the full state payload** on every change — clients are dumb consumers, no client-side condition evaluation
- **Themes travel with the story** — stored in the story JSON, not a global setting
- **Variable injection (`{field_key}`)** happens server-side before broadcasting, using `state.character.fields`
- **Back button replays from history** using stored `damage_amount`/`item_name` — never re-reads from the story file
- **Players never receive the story.** Everything a player sees comes from `resolved` in the SSE payload (`scene_text`, `theme`, `visible_choices`). Choice outcomes, `result_text`, and story structure stay server-side/storyteller-only
- **Players don't know where they are in the story** — no scene counts or progress on any player-facing screen; only the storyteller's view shows progress (design rule, see `.impeccable.md`)

---

## Access Model

Three layers, all lightweight (no user accounts):
1. **Admin (HTTP Basic)** — `verify_admin` + `AdminAuthMiddleware` protect story CRUD, `/api/state/start`, and the `/`, `/editor`, `/run` pages. Disabled when credentials are empty or `AUTH_DISABLED=true`.
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

Six themes: `cyberpunk`, `fantasy`, `deep_space`, `modern`, `horror`, `insanity`

Theme CSS files are in `frontend/src/styles/themes/`. The theme name is a `ThemeName` enum — no arbitrary strings. HP indicators are theme-specific.

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
