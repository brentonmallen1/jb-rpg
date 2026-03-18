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
- `BACKEND_PORT` / `VITE_PORT` — development server ports
- `APP_PORT` / `HOST_PORT` — Docker ports
- `DATA_DIR` / `DATA_PATH` — data directory location

---

## Key Architectural Rules

- **State is always `state.json`** — write to disk on every mutation, never hold state only in memory
- **Scene tracking uses `scene_id` strings**, not array indices
- **SSE broadcasts the full state payload** on every change — clients are dumb consumers, no client-side condition evaluation
- **Themes travel with the story** — stored in the story JSON, not a global setting
- **Variable injection (`{field_key}`)** happens server-side before broadcasting, using `state.character.fields`
- **Back button replays from history** using stored `damage_amount`/`item_name` — never re-reads from the story file

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
      ↓  POST /api/state/start
madlib_in_progress  →  (POST /api/state/madlib × N fields)
      ↓
   running  →  (POST /api/state/choice × scenes)
      ↓
  game_over  →  POST /api/state/finish  →  outcome: victory | defeat
      ↓
  POST /api/state/restart  →  (back to no state)
```

**HP defeat:** auto-sets `status: game_over`, `outcome: "defeat"` immediately — no `/finish` call needed.
**Finale (last scene):** sets `status: game_over`, `outcome: null` — awaits physical dice roll, then storyteller calls `/finish`.

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
- Do not add authentication
- Do not make damage amounts configurable (always 1 HP) — `Choice.amount` exists for forward-compatibility only
- Do not store `connected_count` in `state.json` or return it from `GET /api/state` (SSE only)
