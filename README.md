# J&B's RPG

**Tell stories together.**

A self-hosted web app for collaborative choose-your-own-adventure storytelling. One storyteller runs the show while players connect on their own devices — no accounts, no cloud, just friends around a table.

## What Is This?

J&B's RPG is a tabletop RPG companion that turns your device into a shared adventure. The storyteller guides the narrative while players watch their fate unfold in real-time. Build characters together through mad libs, make choices that matter, collect items, and face a final boss with dice in hand.

## Two Roles

### Storyteller
- Create stories in the visual editor (no code required)
- Run sessions — read the narrative, control the pacing
- Reveal the character, call the finale outcome

### Players
- Connect via URL on any device
- View your live dashboard: HP, items, level, progress
- Contribute to mad libs character creation
- Watch choices ripple through the story in real-time

## How a Game Works

1. **Character Creation** — Everyone contributes to a mad libs template, building a shared hero
2. **Scene by Scene** — The storyteller reads the narrative; players face 3 choices per scene
3. **Consequences** — Choices deal damage, grant items, or level up
4. **The Finale** — Boss encounter with physical dice: levels grant extra rolls, items add bonuses
5. **Victory or Defeat** — Then start a new adventure

## Features

- **6 immersive themes** — Cyberpunk, Fantasy, Deep Space, Modern, Horror, Insanity
- **Visual story editor** — Drag-and-drop scenes, no JSON editing
- **Conditional narrative** — Text changes based on HP, items, levels, or past choices
- **Real-time sync** — All devices update instantly via SSE
- **Persistent state** — Survives refreshes and server restarts
- **Undo button** — Replay from history at any point
- **Light/dark mode** — Global toggle, independent of theme

## Quick Start

### Docker (Recommended)

```bash
docker compose up -d
```

Open [http://localhost:8000](http://localhost:8000)

### Local Development

```bash
just install
just dev
```

- Backend: [http://localhost:8000](http://localhost:8000)
- Frontend: [http://localhost:5173](http://localhost:5173) (hot reload)

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_PORT` | `8000` | API server port |
| `DATA_DIR` | `/data` | Story and state storage |
| `ADMIN_USER` | — | HTTP Basic Auth username (optional) |
| `ADMIN_PASSWORD` | — | HTTP Basic Auth password (optional) |

Copy `.env.example` to `.env` to customize.

## Tech Stack

Python · FastAPI · React · TypeScript · Vite · SSE · Docker

## License

[GNU GPLv3](LICENSE)
