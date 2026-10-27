# Overnight progress log (2026-10-26 → 27)

I worked through the whole plan in `docs/audit-2026-10-26.md` §7. Every chunk is its own commit. Before each commit I checked it four ways:
- the backend tests (now 91);
- lint, type-check and production build;
- a 20-step scripted browser run with a storyteller and a player, including a server restart and taking over from another tab;
- screenshots I reviewed by eye.

Nothing is pushed, since the repo has no remote.

## How to review

The branches are stacked, each built on the previous one:

| Branch | Adds |
|---|---|
| `main` | Phase 0 (bug fixes, tests, CI) and the audit docs. You approved this merge. |
| `phase-1-foundations` | Backend restructure, robustness work, moments engine |
| `phase-3-cinematic-shell` | Storyteller stage, presentation mode, new phone view, Library |
| `phase-4-themes` | Deep themes, atmosphere, moods, sanity corruption, polish. **Contains everything.** |

If you like it all: `git checkout main && git merge --ff-only phase-4-themes`.

To see it, run `just backend` and `just frontend-dev`, then open:
- http://localhost:5173 for the Library (each story is a themed cover).
- Play a story, then open the player link on your phone (or a narrow browser window).
- On the storyteller screen, press **P** for presentation mode (TV). Other keys: **R** reveal, **S** deal choices to phones, **1–3** pick, **Enter** confirm, **Esc** cancel, **B** undo.
- http://localhost:5173/dev/moments to fire every moment, mood and ending in every theme.

## What changed, by phase

### Phase 1: Foundations
- **Backend:** split into `app/` (`models`, `engine`, `storage`, `auth`, `sse`, `routes/`). All game rules are pure functions in `engine.py`.
- **Atomic writes:** stories and the session file are written via a temp file and rename, so a crash can't corrupt them.
- **Story snapshot:** a session plays from a copy of its story, so editing a story mid-game can't break the game.
- **Survives restarts:** sessions survive server restarts and code reloads; the storyteller token is stored as a hash.
- **Take over:** a new tab or device can take control of a running game. Starting another story asks first.
- **Story problems:** missing item names, conditions pointing at scenes that don't exist, scenes with no choices and similar issues are listed in the Editor and block starting a game. They never block saving.
- **Moments engine:** the same dramatic beats play on every screen in sync (HP lost, item, level up, scene change, finale, victory/defeat). Players get an Effects full / subtle / off toggle.
- **Frontend:** the API layer goes through one helper; the Run page is split into one component per game status; failed actions always show an error.

### Phase 3: Cinematic shell
- **Storyteller stage:**
  - the screen wears the story's own theme;
  - top bar with a progress rail (storyteller only);
  - party rail beside the scene, with hero, health, level, items and final roll;
  - a "Previously" recap line;
  - scene text set in a reading font.
- **Choices:** shown as cards with outcome icons. Selecting one opens an inline "read this aloud" panel instead of a modal. Every action has a keyboard shortcut.
- **Presentation mode (P):** full screen with TV-sized type. Hides outcomes, progress, the madlib template and storyteller hints.
- **Character creation:** the template stays sealed (shimmering blanks), with a peek toggle for the storyteller only. Players' phones show the question being asked.
- **Phone:**
  - scene title with its door name;
  - health strip and a hero chip;
  - "Follow along" scene text;
  - choices dealt in one by one;
  - the finale roll panel and the outcome.
  - No progress is shown anywhere.
- **Library:**
  - stories are covers rendered in their own theme;
  - Play is the primary action, Edit sits beside it, and Export/Delete are in a menu;
  - "Now playing" and "Take over" banners;
  - an empty state that explains how the game works.
- **App chrome:** the neutral theme moved off the generic indigo to warm ink with an ember accent (Fraunces, Manrope, Newsreader).

### Phase 4: Deep themes and atmosphere
- **Themes:** all six rewritten with new palettes and deliberate light modes. Fonts are self-hosted, so game night works offline.
  - Fantasy: candlelight, with an illuminated drop cap.
  - Cyberpunk: hazard yellow, clipped corners.
  - Deep Space: a distant amber sun.
  - Horror: bone and blood, in Pirata One and Spectral.
  - Insanity: bile green on a bruised dark, and nothing sits quite straight.
  - Modern: ember.
- **Themed health:** emoji are replaced by candles that gutter out, eyes that get sewn shut, integrity cells, hull shields, sanity sigils and hearts, each with its own name.
- **Atmosphere:**
  - a backdrop behind every screen: mood light plus texture (dust motes, scanlines, parallax stars, film grain) plus weather (acid rain, lightning, fog, glitch bands, failing lights);
  - **per-scene moods**, chosen in the Editor ("Backdrop") or automatic;
  - calm unless effects are set to full.
- **Insanity:** words flicker into runes or Zalgo, faster and denser as sanity drains, and the backdrop swirl tightens. This was your idea.
- **Signature endings per theme:**
  - Fantasy: dawn rays / a snuffed candle.
  - Cyberpunk: a glitching feed.
  - Deep Space: a lightspeed jump / a hull-breach alarm.
  - Horror: house lights come up / a blood curtain.
  - Insanity: the spiral unwinds / the words scatter.
- **Phones stay awake** during a game (Screen Wake Lock).
- **Editor:** `{key}` chips insert character details at the cursor; scenes can be moved up and down.

### Extras after the plan
- **Story import:** an Import button in the Library loads an exported JSON file. It keeps the story's id unless that id is taken.
- **`just e2e`:** a committed browser test (`e2e/run.py`). It starts its own servers on spare ports with throwaway data, so it never touches your stories, and plays the 17 riskiest paths with a storyteller and a player: dealing choices, undo, moments, a server restart, take over, and ending the session. It passed twice in a row.

### Phase 5: Polish
- **Responsive pass:** stage and phone checked at 390, 820 and 1280 px wide, with no horizontal scrolling.
- **Light mode:** checked on stage, phone and Library.
- **Docker:** image built and smoke-tested. It serves the app, API and bundled assets, rejects bad player links, and stops in 2 s.

## Design re-score (self-assessed; please judge for yourself)

| Heuristic | Before | Now | Why |
|---|---|---|---|
| Visibility of status | 2 | 4 | Scene title, progress (storyteller only), "Previously" recap, player count, synced moments |
| Match with the real world | 3 | 3 | Game language throughout; "Lock it in", "Deal choices to the table" |
| User control | 2 | 3 | Quit works, Undo (B), Esc cancels, take over; no undo for madlib answers beyond Previous |
| Consistency | 2 | 3 | One token system across stage, phone and Library; the Editor still has the old look |
| Error prevention | 2 | 3 | Spoiler-free presentation mode, story problems before play, confirm before replacing a session |
| Recognition over recall | 2 | 3 | `{key}` insert chips, outcome icons, keycaps on choices |
| Flexibility | 1 | 3 | Keyboard shortcuts on the stage |
| Aesthetic | 2 | 3–4 | Distinct themes, atmosphere; the Editor drags this down |
| Error recovery | 1 | 3 | Every action surfaces the server's message; watchdog reconnects |
| Help | 3 | 3 | Rules modal; the Library empty state explains the game |
| **Total** | **20** | **~31** | The biggest remaining gap is the Editor |

## Bugs found while verifying (all fixed)
- **Restarts hung forever while anyone was connected.** uvicorn waited on the open live-update streams. Every launch path now has `--timeout-graceful-shutdown 2`.
- **Phones could sit on a dead stream.** Browsers hide SSE comment lines from JavaScript, so the heartbeat is now a real event, and a watchdog reconnects after 50 s of silence.
- **A latent CSS bug:** a missing semicolon in the base tokens silently dropped `--radius-sm`.
- **Light mode hid ghost buttons:** they took the background colour on every themed screen.
- **Unreadable moments:** Victory was green on green, and moment titles sat directly over page text (they now get a scrim).
- **Zalgo rendered as boxes** in the Insanity font; it now uses a system serif. Insanity numbers also read "1" as "I".

## Decisions I made without you (easy to revisit)
- **Saving never blocks.** The Editor autosaves half-finished work, so story checks only stop *starting* a game.
- **Take over** is open to any admin. Without admin credentials configured, that means anyone who can reach the server (same as starting a game today).
- **Watching without joining:** admins can observe a running game only when admin auth is configured.
- **Phones show the scene title.** The full scene text sits behind "Follow along" (collapsed), so attention stays on the storyteller.
- **Storyteller effects:** the stage plays moments subtly in normal mode and fully in presentation mode.
- **Corruption is Insanity-only.** Horror doesn't get it.
- **Fonts:** fantasy keeps Cinzel / Crimson; the others changed (see Phase 4).

## Not done / next candidates
- **Editor redesign:** splitting `Editor.tsx` (1,200 lines) into panels, and a live player-view preview. Only targeted improvements so far.
- **Ambient audio and stings** per theme. This needs sound assets, so it's your call.

## For the morning: per-player decision makers (your idea, not built)

Your rules doc already says *"each player being the decision maker for that scene"*. Some design notes to start the conversation:

- **Joining:** phones enter a name when they join. The server keeps the list in the session, and the storyteller sees who's at the table.
- **Modes** (story or session setting):
  - `off` (today);
  - `rotate` (round-robin in join order);
  - `storyteller picks` (tap a name each scene).
- **Turn display:** the current decision maker's name shows on every phone and the TV ("Wren decides"). Optionally, only their phone shows tappable choices, sending a *suggestion* the storyteller confirms. The storyteller stays in control.
- **Open questions:**
  1. More scenes than players: wrap around, or let the storyteller choose?
  2. Drop-outs and reconnects: identify players by a device token rather than their name?
  3. Should the decision maker's phone submit the choice, or only highlight it?
  4. Does Back rewind the turn too?
  5. Does this replace the voting idea in `ideas.md`, or sit beside it as another mode?
- **Fits the design:**
  - a per-device player token (a fourth access layer);
  - `players` and `turn` in the session;
  - `resolved.decision_maker` for display;
  - a new moment, "your turn", on that player's phone.
