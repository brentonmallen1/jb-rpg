# Overnight progress log (2026-10-26 → 27)

Working through the plan in `docs/audit-2026-10-26.md` §7. Each chunk is a commit,
verified with the test suite, lint/type-check/build, and a scripted browser run
(storyteller + player). Nothing is pushed (the repo has no remote).

## Branches

| Branch | Contains | State |
|---|---|---|
| `main` | Phase 0 (bug fixes, tests, CI) + audit docs | merged (you approved) |
| `phase-1-foundations` | Phase 1, branched from `main` | **review, then merge** |
| `phase-3-cinematic-shell` | Phase 3, branched from `phase-1-foundations` | see below |

## Phase 1: Foundations (done)

**Backend** (`68eb6af`): `main.py` is now a thin entry point; the app lives in `app/`
(`models`, `engine`, `storage`, `auth`, `sse`, `routes/`). All game rules are pure
functions in `app/engine.py`.
- Atomic writes for stories and `state.json` (temp file + rename).
- **Story snapshot**: a session keeps a copy of its story, so editing a story mid-game can't break play.
- **Sessions survive restarts**: the storyteller token is stored as a hash in `state.json`, so `--reload` no longer kills the game.
- **Take over**: a new tab (or device) can resume control of a running session.
- Starting a story while another is running asks first (take over / end it and start).
- **Story problems** (nameless items, conditions pointing at missing scenes, scenes with no choices…) are listed in the Editor and block starting a game, never saving.
- SSE heartbeat + client watchdog; admins can observe sessions when admin auth is configured.
- Removed the legacy vanilla-JS `static/` folder and stopped tracking the duplicate root `stories/` folder (files still on disk; `data/` is canonical, matching your `.env`).

**Frontend** (`afb2e5c`):
- `api.ts` uses a single `request()` helper.
- `Run.tsx` is split into one component per status, and failed actions always show up in the error banner.
- **Moments engine**: synced dramatic overlays on every phone (HP lost, item, level up, scene change, finale, victory/defeat, character reveal), with themed copy per theme. Players get an **Effects: full / subtle / off** toggle (✦ in the player toolbar).
- `/dev/moments` (dev builds only) lets you fire any moment in any theme. Run `just frontend-dev` and open http://localhost:5173/dev/moments.

**Found while verifying** (fixed):
- **Restarts hung while anyone was connected.** uvicorn waited forever on open live-update streams, so a stopped or reloading server lingered and kept feeding clients. Every launch path now uses `--timeout-graceful-shutdown 2`.
- **Phones could sit on a dead connection.** Browsers hide SSE comment lines, so the heartbeat is now a real event, and a watchdog reconnects after 50 s of silence.
- **New tabs didn't offer Take over** when admin auth isn't configured; they showed "No active session" instead. Fixed.
- **The Victory moment was unreadable** (green on green). It now uses the theme's accent light.

**Deferred:** self-hosting fonts moves to Phase 4, which changes several theme fonts anyway.

## Decisions I made without you (easy to revisit)

- **Saving never blocks.** The Editor autosaves half-finished work, so story checks only stop *starting* a game.
- **Take over is open to any admin.** Anyone who passes admin auth can take over a running session. Without admin credentials configured, that's anyone who can reach the server (same as starting one today).
- **Admins can watch a session without joining it**, but only when admin auth is configured. Otherwise a non-storyteller tab sees a "running elsewhere / Take over" prompt.
- **Choices that read wrong say so.** If a stale choice order ever reaches the server, it returns 409 "reveal the choices again" instead of guessing.

## For the morning: per-player decision makers (your idea, not built)

Your rules doc already says *"each player being the decision maker for that scene"*.
Here are some design notes to start the conversation:

- **Joining:** phones enter a name on join (stored per device, e.g. `localStorage` + a server-side player list in the session). The storyteller sees who's at the table.
- **Mode (story or session setting):** `off` (today) | `rotate` (round-robin in join order) | `storyteller picks` (tap a name each scene).
- **Turn display:** the current decision maker's name is on every phone and the TV ("Wren decides"). Optionally, only their phone shows the choices as tappable, sending a *suggestion* the storyteller confirms. The storyteller stays in control, and the access model doesn't change.
- **Open questions:**
  1. More scenes than players: wrap around, or let the storyteller choose?
  2. What happens when a player drops or reconnects? (Identity by device token rather than name.)
  3. Should the decision maker's phone *submit* the choice, or only highlight it for the table?
  4. Does Back rewind the turn order too?
  5. Does this replace the voting idea in `ideas.md`, or live alongside it as a third mode?
- **Fits the current design:** player identity would be a fourth access layer (a per-device player token issued at join). The engine gets a `turn` field and `players` list; `resolved` gains `decision_maker`.

## Phase 3: Cinematic shell (in progress, see below)
