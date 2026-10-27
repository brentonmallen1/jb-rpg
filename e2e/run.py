"""End-to-end check: a storyteller and a player play through the risky paths in real browsers,
then the Editor is exercised (preview, autosave, problems, Playtest), then players take turns and vote.

Starts its own backend and Vite dev server on spare ports with a throwaway data
directory, so it never touches your stories or a running game. Run: `just e2e`.
Needs Google Chrome installed (or run `uv run --with playwright playwright install chromium`).
"""

import base64
import json
import os
import shutil
import signal
import socket
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
ADMIN = {"username": "e2e", "password": "e2e-password"}
ADMIN_HEADER = "Basic " + base64.b64encode(f"{ADMIN['username']}:{ADMIN['password']}".encode()).decode()

results: list[tuple[str, bool]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""), flush=True)


def call(path: str, body=None, token: str | None = None, method: str = "POST"):
    headers = {"Content-Type": "application/json", "Authorization": ADMIN_HEADER, **({"X-Session-Token": token} if token else {})}
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
    env = {**os.environ, "DATA_DIR": str(data_dir), "AUTH_DISABLED": "false", "ADMIN_USER": ADMIN["username"], "ADMIN_PASSWORD": ADMIN["password"]}
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
    except ProcessLookupError:
        pass  # already gone
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)


def port_in_use(port: int) -> bool:
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) == 0


def launch(p):
    try:
        return p.chromium.launch(channel="chrome")
    except PlaywrightError:
        return p.chromium.launch()


def main() -> int:
    busy = [port for port in (BACKEND_PORT, FRONTEND_PORT) if port_in_use(port)]
    if busy:
        print(f"Ports {busy} are in use (a previous run still going?). Stop those processes first.")
        return 1

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

        teller_ctx = browser.new_context(viewport={"width": 1280, "height": 900}, http_credentials=ADMIN)
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
        state = call("/api/state", token=token, method="GET")["state"]
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
        other = browser.new_context(viewport={"width": 1280, "height": 900}, http_credentials=ADMIN).new_page()
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

        editor_checks(browser)
        turn_checks(browser)
        vote_checks(browser)
        flashing_checks(browser)
        browser.close()


def editor_checks(browser) -> None:
    """The Editor: live preview, autosave, inline problems, Playtest."""
    page = browser.new_context(viewport={"width": 1440, "height": 900}, http_credentials=ADMIN).new_page()
    page.goto(f"{B}/editor/{STORY}")
    page.wait_for_selector(".ed-panel", timeout=15000)

    scene_text = page.locator("#scene-text")
    scene_text.click()
    page.keyboard.press("End")
    page.keyboard.type(" ZEBRA")
    page.wait_for_timeout(300)
    check("Editor preview updates as you type", "ZEBRA" in page.locator(".ed-preview").inner_text())
    page.wait_for_timeout(2500)
    saved = call(f"/api/stories/{STORY}", method="GET")
    check("Editor autosaves", "ZEBRA" in saved["scenes"][0]["base_text"])

    item = page.locator(".ed-choice--item input[id$='-item']").first
    name = item.input_value()
    item.fill("")
    page.wait_for_selector(".ed-choice--item .ed-error", timeout=8000)
    check("A missing item name is flagged on its field", True)
    item.fill(name)
    page.wait_for_selector(".editor__problems", state="detached", timeout=8000)
    check("The problem clears once fixed", True)

    page.click("text=Playtest")
    page.wait_for_url(B + "/run", timeout=10000)
    page.wait_for_selector("#madlib-input", timeout=10000)
    check("Playtest starts a game of the draft", True)


def turn_checks(browser) -> None:
    """Players take turns: start from the Library, two phones join by name, picks reach the stage."""
    teller = browser.new_context(viewport={"width": 1280, "height": 900}, http_credentials=ADMIN).new_page()
    teller.goto(B + "/")
    teller.wait_for_selector(".cover")
    teller.click(".cover button:text-is('Play')")
    teller.wait_for_selector("text=Who makes the choices?")
    check("Play defaults to the storyteller deciding", teller.locator("input[value='storyteller']").is_checked())
    teller.click("text=Players take turns")
    teller.click("text=Start the game")
    teller.click("button:has-text('End it and start')")  # the Playtest from the editor is still running
    teller.wait_for_url(B + "/run", timeout=10000)
    teller.wait_for_selector("#madlib-input", timeout=10000)
    session_id = call("/api/state", token=teller.evaluate("sessionStorage.getItem('jb_rpg_session_token')"), method="GET")["state"]["session_id"]

    phones = {}
    for name in ["Wren", "Bea"]:
        phone = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
        phone.goto(f"{B}/player/{session_id}")
        phone.wait_for_selector("text=What should we call you?", timeout=10000)
        phone.fill("input[aria-label='Your name']", name)
        phone.click("text=Join the table")
        phone.wait_for_selector("text=Creating your hero", timeout=10000)
        phones[name] = phone

    for answer in ["Bartholomew", "the Salt Marshes", "a lantern"]:
        teller.fill("#madlib-input", answer)
        teller.keyboard.press("Enter")
        teller.wait_for_timeout(400)
    teller.click("text=Begin the story")
    phones["Wren"].wait_for_selector(".turn-banner--mine", timeout=10000)
    check("The first player's phone says it's their call", "Wren" in phones["Bea"].locator(".turn-banner").inner_text())

    teller.keyboard.press("s")
    phones["Wren"].wait_for_selector("button.dealt__card", timeout=10000)
    phones["Wren"].locator("button.dealt__card").nth(1).click()
    teller.wait_for_selector(".choice-card__pick", timeout=10000)
    check("The decider's pick shows on the stage", "Wren" in teller.locator(".choice-card").nth(1).inner_text())

    teller.keyboard.press("2")
    teller.wait_for_selector(".reading-panel")
    teller.keyboard.press("Enter")
    phones["Bea"].wait_for_selector(".turn-banner--mine", timeout=10000)
    check("The turn passes to the next player", True)


def vote_checks(browser) -> None:
    """The table votes: players vote on their phones, the storyteller sees the tally (ties flagged) and decides."""
    teller = browser.new_context(viewport={"width": 1280, "height": 900}, http_credentials=ADMIN).new_page()
    teller.goto(B + "/")
    teller.wait_for_selector(".cover")
    teller.click(".cover button:text-is('Play')")
    teller.click("text=The table votes")
    teller.click("text=Start the game")
    teller.click("button:has-text('End it and start')")  # the turn-taking game is still running
    teller.wait_for_url(B + "/run", timeout=10000)
    teller.wait_for_selector("#madlib-input", timeout=10000)
    session_id = call("/api/state", token=teller.evaluate("sessionStorage.getItem('jb_rpg_session_token')"), method="GET")["state"]["session_id"]

    phones = []
    for name in ["Ann", "Ben"]:
        phone = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
        phone.goto(f"{B}/player/{session_id}")
        phone.wait_for_selector("input[aria-label='Your name']", timeout=10000)
        phone.fill("input[aria-label='Your name']", name)
        phone.click("text=Join the table")
        phone.wait_for_selector("text=Creating your hero", timeout=10000)
        phones.append(phone)

    for answer in ["Bartholomew", "the Salt Marshes", "a lantern"]:
        teller.fill("#madlib-input", answer)
        teller.keyboard.press("Enter")
        teller.wait_for_timeout(400)
    teller.click("text=Begin the story")
    teller.wait_for_selector(".turn-line", timeout=10000)
    teller.keyboard.press("s")

    for phone, index in zip(phones, [0, 2]):
        phone.wait_for_selector("button.dealt__card", timeout=10000)
        phone.locator("button.dealt__card").nth(index).click()
        phone.click("button.join__button")
        phone.wait_for_selector("text=Your vote is in", timeout=10000)
    check("Phones show votes left, never the tally", phones[1].locator(".choice-card__votes").count() == 0)
    teller.wait_for_selector(".vote-tie", timeout=10000)
    check("A tie highlights both choices for the storyteller", teller.locator(".choice-card.is-favourite").count() == 2)



def flashing_checks(browser) -> None:
    """No flashing: chosen at Play, caps every phone, and the storyteller can switch it mid-game."""
    teller = browser.new_context(viewport={"width": 1280, "height": 900}, http_credentials=ADMIN).new_page()
    teller.goto(B + "/")
    teller.wait_for_selector(".cover")
    teller.click(".cover button:text-is('Play')")
    teller.check("text=No flashing effects")
    teller.click("text=Start the game")
    teller.click("button:has-text('End it and start')")  # the voting game is still running
    teller.wait_for_url(B + "/run", timeout=10000)
    teller.wait_for_selector("#madlib-input", timeout=10000)
    session_id = call("/api/state", token=teller.evaluate("sessionStorage.getItem('jb_rpg_session_token')"), method="GET")["state"]["session_id"]

    phone = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
    phone.goto(f"{B}/player/{session_id}")
    phone.wait_for_selector("text=Creating your hero", timeout=10000)
    effects = phone.locator(".effects__button")
    check("No flashing caps a phone set to full effects", effects.inner_text().strip() == "Effects: Gentle", effects.inner_text())
    effects.click()
    check("Full is locked while the table asks for no flashing", phone.locator("input[value='full']").is_disabled())
    if os.environ.get("E2E_SHOTS"):
        phone.wait_for_timeout(400)  # let the panel finish fading in
        phone.screenshot(path=os.environ["E2E_SHOTS"] + "/effects-menu.png")
    phone.keyboard.press("Escape")

    teller.click("button[aria-pressed='true'][title='No flashing (all screens)']")
    phone.wait_for_selector(".effects__button:has-text('Effects: Full')", timeout=10000)
    check("The storyteller can turn flashing back on mid-game", True)

    effects.click()
    phone.click("text=Gentle")
    check("A phone can choose its own level", effects.inner_text().strip() == "Effects: Gentle")


if __name__ == "__main__":
    sys.exit(main())
