"""End-to-end check: a storyteller and a player play through the risky paths in real browsers.

Starts its own backend and Vite dev server on spare ports with a throwaway data
directory, so it never touches your stories or a running game. Run: `just e2e`.
Needs Google Chrome installed (or run `uv run --with playwright playwright install chromium`).
"""

import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BACKEND_PORT, FRONTEND_PORT = 8871, 5271
B, A = f"http://localhost:{FRONTEND_PORT}", f"http://localhost:{BACKEND_PORT}"
STORY = "demo-crystal-caverns"

results: list[tuple[str, bool]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""), flush=True)


def call(path: str, body=None, token: str | None = None, method: str = "POST"):
    headers = {"Content-Type": "application/json", **({"X-Session-Token": token} if token else {})}
    data = None if method == "GET" else json.dumps(body or {}).encode()
    req = urllib.request.Request(A + path, data=data, method=method, headers=headers)
    return json.load(urllib.request.urlopen(req))


def wait_for(url: str, timeout: float = 30) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return
        except Exception:
            time.sleep(0.3)
    raise RuntimeError(f"{url} did not come up")


def start_backend(data_dir: Path) -> subprocess.Popen:
    env = {**os.environ, "DATA_DIR": str(data_dir), "AUTH_DISABLED": "false", "ADMIN_USER": "", "ADMIN_PASSWORD": ""}
    proc = subprocess.Popen(
        ["uv", "run", "uvicorn", "main:app", "--port", str(BACKEND_PORT), "--timeout-graceful-shutdown", "2"],
        cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    wait_for(f"{A}/api/config")
    return proc


def stop(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=10)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        os.killpg(proc.pid, signal.SIGKILL)


def launch(p):
    try:
        return p.chromium.launch(channel="chrome")
    except PlaywrightError:
        return p.chromium.launch()


def main() -> int:
    data_dir = Path(tempfile.mkdtemp(prefix="jb-rpg-e2e-"))
    (data_dir / "stories").mkdir()
    shutil.copy(ROOT / "data" / "stories" / f"{STORY}.json", data_dir / "stories")

    backend = start_backend(data_dir)
    frontend = subprocess.Popen(
        ["npx", "vite", "--port", str(FRONTEND_PORT), "--strictPort"],
        cwd=ROOT / "frontend", env={**os.environ, "BACKEND_PORT": str(BACKEND_PORT)},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    try:
        wait_for(B)
        run_checks(data_dir, lambda: start_backend(data_dir), backend_ref := [backend])
        backend = backend_ref[0]
    finally:
        stop(frontend)
        stop(backend)
        shutil.rmtree(data_dir, ignore_errors=True)

    passed = sum(ok for _, ok in results)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if results and passed == len(results) else 1


def run_checks(data_dir: Path, restart_backend, backend_ref: list) -> None:
    started = call("/api/state/start", {"story_id": STORY})
    token, session_id = started["token"], started["state"]["session_id"]

    with sync_playwright() as p:
        browser = launch(p)

        teller_ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        teller_ctx.add_init_script(f"sessionStorage.setItem('jb_rpg_session_token','{token}'); localStorage.setItem('jb_rpg_presentation','off')")
        teller = teller_ctx.new_page()
        page_errors: list[str] = []
        teller.on("pageerror", lambda e: page_errors.append(str(e)))
        teller.goto(B + "/run")
        teller.wait_for_selector("#madlib-input", timeout=15000)
        check("Storyteller /run loads directly", not page_errors, "; ".join(page_errors)[:200])

        player = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
        player_requests: list[str] = []
        player.on("request", lambda r: player_requests.append(r.url))
        player.goto(f"{B}/player/{session_id}")
        player.wait_for_selector("text=Creating your hero", timeout=15000)
        check("Player sees the madlib question", player.locator(".phone-question").count() == 1)
        check("Player wears the story's theme", player.evaluate("document.documentElement.classList.contains('deep_space')"))
        teller.wait_for_timeout(800)
        count = teller.locator(".stage__players").inner_text().strip()
        check("Storyteller counts exactly one player", count == "1 player", count)
        streams = [u for u in player_requests if "/api/events" in u]
        check("Player opens one live-update stream", len(streams) == 1, str(streams))

        for answer in ["Bartholomew", "the Salt Marshes", "a lantern"]:
            teller.fill("#madlib-input", answer)
            teller.keyboard.press("Enter")
            teller.wait_for_timeout(400)
        teller.click("text=Begin the story")
        teller.wait_for_selector("text=Reveal choices", timeout=5000)

        teller.keyboard.press("r")
        teller.wait_for_selector(".choice-card")
        player.wait_for_timeout(500)
        check("Player sees no choices before they're dealt", player.locator(".dealt__card").count() == 0)
        teller.keyboard.press("s")
        player.wait_for_selector(".dealt__card", timeout=5000)
        check("Player sees three dealt choices", player.locator(".dealt__card").count() == 3)
        check("Player never loads the story or config",
              not any("/api/stories" in u or "/api/config" in u for u in player_requests))

        # Choose, reveal the next scene, undo: the next scene's shuffle must not leak back
        first_title = teller.locator(".stage-title").inner_text()
        teller.keyboard.press("1")
        teller.wait_for_selector(".reading-panel")
        teller.keyboard.press("Enter")
        teller.wait_for_function("t => document.querySelector('.stage-title')?.innerText !== t", arg=first_title)
        teller.keyboard.press("r")
        teller.wait_for_selector("text=Deal choices to the table")
        teller.keyboard.press("b")
        teller.wait_for_function("t => document.querySelector('.stage-title')?.innerText === t", arg=first_title)
        state = json.load(urllib.request.urlopen(urllib.request.Request(A + "/api/state", headers={"X-Session-Token": token})))["state"]
        check("Undo clears the next scene's shuffle", state["shuffled_indices"] == [] and not state["choices_revealed"])

        teller.keyboard.press("r")
        teller.wait_for_selector(".choice-card:has(.outcome--damage)")
        teller.locator(".choice-card:has(.outcome--damage)").click()
        teller.wait_for_selector(".reading-panel")
        teller.keyboard.press("Enter")
        try:
            player.wait_for_selector(".moment--hp_lost", timeout=10000)  # moments queue: earlier ones play first
            check("HP-lost moment plays on the player's phone", True)
        except PlaywrightError:
            check("HP-lost moment plays on the player's phone", False)
        check("No storyteller errors so far", teller.locator(".stage-error").count() == 0)

        # The game survives a server restart
        stop(backend_ref[0])
        backend_ref[0] = restart_backend()
        valid = call("/api/state/validate-token", token=token, method="GET")
        check("Session and token survive a server restart", valid.get("valid") is True, str(valid))
        teller.reload()
        teller.wait_for_selector(".stage-title", timeout=15000)
        check("Run page resumes after the restart", True)

        # Another tab takes over
        other = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
        other.goto(B + "/run")
        other.wait_for_selector("text=Session running elsewhere", timeout=15000)
        other.click("button:has-text('Take over')")
        other.wait_for_selector(".stage-title", timeout=15000)
        check("A second tab can take over", True)
        teller.keyboard.press("r")
        teller.wait_for_timeout(800)
        check("The old tab loses control", teller.locator(".stage-error").count() == 1)

        # End the session from the new tab
        other.click("[aria-label='End session']")
        other.click("button:has-text('End Session')")
        other.wait_for_url(B + "/", timeout=10000)
        check("Ending the session returns to the library", True)
        try:
            # The player's stream died with the restart; the watchdog reconnects within ~60s
            player.wait_for_selector("text=The session has ended", timeout=90000)
            check("The player is told the session ended", True)
        except PlaywrightError:
            check("The player is told the session ended", False)

        browser.close()


if __name__ == "__main__":
    sys.exit(main())
