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


def signed_in_context(browser, **options):
    """A browser context that has signed in as the storyteller (the cookie the sign-in page sets)."""
    ctx = browser.new_context(**options)
    resp = ctx.request.post(B + "/api/admin/login", data={"username": ADMIN["username"], "password": ADMIN["password"]})
    assert resp.ok, resp.status
    return ctx


def login_checks(browser) -> None:
    """Strangers get the app's own sign-in page (no browser prompt), then land where they were going."""
    page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
    page.goto(B + "/run")
    page.wait_for_selector("text=Sign in to run the table", timeout=10000)
    check("Storyteller pages go to the sign-in page", page.url.startswith(B + "/login"), page.url)
    page.fill("input[autocomplete='username']", ADMIN["username"])
    page.fill("input[type='password']", "wrong")
    page.click("button:text-is('Sign in')")
    page.wait_for_selector("text=That isn't the storyteller login.", timeout=10000)
    check("A wrong password is refused politely", True)
    if os.environ.get("E2E_SHOTS"):
        page.screenshot(path=os.environ["E2E_SHOTS"] + "/login.png")
    page.goto(B + "/login")
    page.fill("input[autocomplete='username']", ADMIN["username"])
    page.fill("input[type='password']", ADMIN["password"])
    page.click("button:text-is('Sign in')")
    page.wait_for_selector("text=Your stories", timeout=10000)
    check("Signing in opens the library", True)
    kept = [c for c in page.context.cookies() if c["name"] == "jb_admin"][0]["value"]
    page.click("summary:text-is('Sign out')")
    page.click("button:text-is('Sign out here')")
    page.wait_for_url(B + "/login", timeout=10000)
    check("Signing out returns to the sign-in page", True)
    with urllib.request.urlopen(urllib.request.Request(f"{A}/api/admin/session", headers={"Cookie": f"jb_admin={kept}"})) as r:
        check("A signed-out cookie never works again", json.load(r)["signed_in"] is False)

    # Sign out everywhere: another browser that's signed in has to sign in again too
    other = browser.new_context().new_page()
    for p_ in (page, other):
        p_.goto(B + "/login")
        p_.fill("input[autocomplete='username']", ADMIN["username"])
        p_.fill("input[type='password']", ADMIN["password"])
        p_.click("button:text-is('Sign in')")
        p_.wait_for_selector("text=Your stories", timeout=10000)
    page.click("summary:text-is('Sign out')")
    page.click("button:text-is('Sign out everywhere')")
    page.wait_for_url(B + "/login", timeout=10000)
    other.goto(B + "/")
    other.wait_for_url(B + "/login", timeout=10000)
    check("Signing out everywhere signs out every browser", True)
    page.context.close()
    other.context.close()


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

        teller_ctx = signed_in_context(browser, viewport={"width": 1280, "height": 900})
        teller_ctx.add_init_script(f"sessionStorage.setItem('jb_rpg_session_token','{token}'); localStorage.setItem('jb_rpg_presentation','off')")
        teller = teller_ctx.new_page()
        page_errors: list[str] = []
        teller.on("pageerror", lambda e: page_errors.append(str(e)))
        teller.goto(B + "/run")
        teller.wait_for_selector("#madlib-input", timeout=15000)
        check("Storyteller /run loads directly", not page_errors, "; ".join(page_errors)[:200])
        invite = teller.locator(".invite")
        check("A new game shows the invite with a QR code", invite.count() == 1 and invite.locator("svg.qr").count() == 1)
        check("The invite's link is the player link", session_id in invite.locator(".invite__link").inner_text())

        player = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
        player_requests: list[str] = []
        player.on("request", lambda r: player_requests.append(r.url))
        player.goto(f"{B}/player/{session_id}")
        player.wait_for_selector("text=Creating your hero", timeout=15000)
        check("Player sees the madlib question", player.locator(".phone-question").count() == 1)
        check("Player wears the story's theme", player.evaluate("document.documentElement.classList.contains('fantasy')"))
        teller.wait_for_timeout(800)
        count = teller.locator(".stage__players").inner_text().strip()
        check("Storyteller counts exactly one player", count == "1 player", count)
        check("The invite counts the player who joined", "1 player connected" in teller.locator(".invite__count").inner_text())
        teller_ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=B)
        teller.click(".invite button:has-text('Copy QR code')")
        teller.wait_for_selector(".invite button:has-text('Copied')", timeout=5000)
        types = teller.evaluate("navigator.clipboard.read().then(items => items.flatMap(i => i.types))")
        check("Copy QR code puts the image on the clipboard", "image/png" in types, str(types))
        teller.click("button[aria-label='Hide the invite']")
        check("The invite can be hidden", teller.locator(".invite").count() == 0)
        teller.click("button.stage__invite")
        check("The toolbar's Invite brings the QR code back", teller.locator("[role='dialog'] svg.qr").count() == 1)
        teller.keyboard.press("Escape")
        streams = [u for u in player_requests if "/api/events" in u]
        check("Player opens one live-update stream", len(streams) == 1, str(streams))

        for answer in ["Bartholomew", "the Salt Marshes", "a lantern"]:
            teller.fill("#madlib-input", answer)
            teller.keyboard.press("Enter")
            teller.wait_for_timeout(400)
        teller.wait_for_selector("button.crests__option", timeout=10000)
        check("The stage offers three crests (emblems, or drawn from the answers)", teller.locator("button.crests__option").count() == 3)
        teller.locator("button.crests__option").nth(1).click()
        teller.wait_for_selector("button.crests__option:nth-child(2).is-chosen", timeout=10000)
        check("The chosen crest is the one the stage marks", teller.locator("button.crests__option").nth(1).get_attribute("aria-pressed") == "true")
        emblem = teller.locator("button.crests__option img.crest--emblem").count() == 3
        print(f"  (crests from {'the emblem service' if emblem else 'the built-in fallback'})")
        # The phones show the same three, and a player can choose
        player.wait_for_selector(".phone-crests button.crests__option", timeout=10000)
        check("The phones offer the same three crests", player.locator(".phone-crests button.crests__option").count() == 3)
        check("The phone marks the stage's choice", player.locator(".phone-crests button.crests__option").nth(1).get_attribute("aria-pressed") == "true")
        player.locator(".phone-crests button.crests__option").nth(2).click()
        teller.wait_for_selector("button.crests__option:nth-child(3).is-chosen", timeout=10000)
        check("A player's choice shows on the stage", True)
        teller.click("button:has-text('Another three')")
        teller.wait_for_function("() => document.querySelector('button.crests__option:nth-child(1)')?.classList.contains('is-chosen')", timeout=10000)
        player.wait_for_selector(".phone-crests button.crests__option:nth-child(1).is-chosen", timeout=10000)
        check("Another three reach the phones too", True)
        teller.click("text=Begin the story")
        teller.wait_for_selector("text=Reveal choices", timeout=5000)

        player.wait_for_selector(".telling", timeout=5000)
        check("While the scene is told the phone shows it being told, not its words", player.locator(".read-along").count() == 0)
        player.click(".telling__read")
        player.wait_for_selector(".read-along .telling--inline", state="attached", timeout=5000)
        check("Read along shows the words as the scene is told, the pen writing at their end",
              player.locator(".read-along__text").inner_text().strip() != "")
        player.click("text=Just listen")
        player.wait_for_selector(".telling__lines", timeout=5000)
        check("Just listen goes back to the story being told", player.locator(".read-along").count() == 0)
        teller.keyboard.press("r")
        teller.wait_for_selector(".choice-card")
        player.wait_for_selector(".read-along", timeout=5000)
        check("Revealing the choices on the stage releases the words to phones", player.locator(".telling").count() == 0)
        check("Player sees no choices before they're dealt", player.locator(".dealt__card").count() == 0)
        teller.keyboard.press("s")
        player.wait_for_selector(".dealt__card", timeout=5000)
        check("Player sees three dealt choices", player.locator(".dealt__card").count() == 3)
        check("The hero is docked at the bottom with their health", player.locator(".dock .phone-label:text-is('Your hero')").count() == 1
              and player.locator(".dock .dock__health").count() == 1)
        player.click(".dock__who")
        check("Tapping the hero shows their story", player.locator("dialog.sheet[open] .phone-text").count() == 1)
        player.keyboard.press("Escape")
        player.click(".dock__pack")
        check("The backpack opens from the dock", player.locator("dialog.sheet[open] h2:text-is('The backpack')").count() == 1)
        player.keyboard.press("Escape")
        toggle = player.locator(".read-along__toggle")
        if toggle.count():
            clamped = player.locator(".read-along__text").bounding_box()["height"]
            dock_top = player.locator(".dock__bar").bounding_box()["y"]
            toggle.click()
            check("Read along opens the rest of the scene", player.locator(".read-along__text").bounding_box()["height"] > clamped)
            check("Opening the text doesn't move the hero", player.locator(".dock__bar").bounding_box()["y"] == dock_top)
            below = player.evaluate("document.querySelector('.phone-choices').getBoundingClientRect().top > innerHeight - 120")
            if below:  # the scene is long enough to push the choices off-screen
                player.wait_for_selector(".dock__chip", timeout=3000)
                player.click(".dock__chip")
                player.wait_for_selector(".dock__chip", state="detached", timeout=3000)
                check("The choices chip scrolls to the choices", player.evaluate("window.scrollY") > 0)
            else:
                check("No choices chip while the choices are on screen", player.locator(".dock__chip").count() == 0)
            player.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        player.click("button[aria-label='Settings']")
        player.click("label[title='Largest']")
        check("Text size scales the phone", player.evaluate("document.documentElement.style.fontSize") == "132%")
        player.click("label[title='Standard']")
        player.keyboard.press("Escape")
        check("Player never loads the story or config",
              not any("/api/stories" in u or "/api/config" in u for u in player_requests))

        # Choose, reveal the next scene, undo: the next scene's shuffle must not leak back
        first_title = teller.locator(".stage-title").inner_text()
        teller.keyboard.press("1")
        teller.wait_for_selector(".reading-panel")
        teller.keyboard.press("Enter")
        player.wait_for_selector(".moment--hp_lost, .moment--item_gained, .moment--level_up", timeout=5000)
        check("A choice's outcome plays on the phones right away", True)
        check("No pause card before the outcome", player.locator(".moment--suspense").count() == 0)
        teller.wait_for_function("t => document.querySelector('.stage-title')?.innerText !== t", arg=first_title)
        player.wait_for_function("window.scrollY === 0", timeout=5000)
        check("A new scene starts the phone at the top", True)
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

        # The library's header says a game is in progress and leads back to it
        teller.goto(B + "/")
        teller.wait_for_selector(".now-playing-chip__summary:has-text('Now playing')", timeout=10000)
        check("The library's header shows the game in progress", True)
        teller.click(".now-playing-chip__summary")
        teller.click("button:has-text('Return to the table')")
        teller.wait_for_selector(".stage-title", timeout=15000)
        check("The header leads back to the table", teller.url.endswith("/run"))

        # Another tab takes over
        other = signed_in_context(browser, viewport={"width": 1280, "height": 900}).new_page()
        other.goto(B + "/run")
        other.wait_for_selector("text=Session running elsewhere", timeout=15000)
        other.click("button:has-text('Take over')")
        other.wait_for_selector(".stage-title", timeout=15000)
        check("A second tab can take over", True)
        teller.keyboard.press("r")
        teller.wait_for_timeout(800)
        check("The old tab loses control", teller.locator(".stage-error").count() == 1)
        teller.goto(B + "/")
        teller.wait_for_selector(".now-playing-chip__summary:has-text('Playing elsewhere')", timeout=10000)
        check("The old tab's library says the game is playing elsewhere", True)

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
        roll_checks(browser)
        backpack_checks(browser)
        door_checks(browser)
        login_checks(browser)
        browser.close()


def editor_checks(browser) -> None:
    """The Editor: live preview, autosave, inline problems, Playtest."""
    page = signed_in_context(browser, viewport={"width": 1440, "height": 900}).new_page()
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

    def chasm_lines():
        saved = call(f"/api/stories/{STORY}", method="GET")["scenes"][0]["conditional_text"]
        return [c for c in saved if c["condition"].get("scene_id") == "scene_chasm_bridge" and c["condition"].get("outcome") == "item"]

    page.select_option("select[aria-label='Add text for after a scene']", label="The Chasm Bridge")
    slot = page.locator("textarea[aria-label='If the hero found an item in The Chasm Bridge']")
    slot.fill("You still have the rope.")
    page.wait_for_timeout(2500)
    check("Text for after a scene saves as that scene's outcome", [c["text"] for c in chasm_lines()] == ["You still have the rope."])
    slot.fill("")
    page.wait_for_timeout(2500)
    check("Emptying an outcome's text removes the line", chasm_lines() == [])

    page.click("text=Playtest")
    page.wait_for_url(B + "/run", timeout=10000)
    page.wait_for_selector("#madlib-input", timeout=10000)
    check("Playtest starts a game of the draft", True)


def turn_checks(browser) -> None:
    """Players take turns: start from the Library, two phones join by name, picks reach the stage."""
    teller = signed_in_context(browser, viewport={"width": 1280, "height": 900}).new_page()
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

    # A phone that reloads (as after waking from sleep) is still one player
    teller.wait_for_selector(".players-menu summary:has-text('2 players')", timeout=10000)
    phones["Bea"].reload()
    phones["Bea"].wait_for_selector("text=Creating your hero", timeout=10000)
    teller.wait_for_timeout(1500)
    check("A phone that reloads isn't counted twice", "2 players" in teller.locator(".players-menu summary").inner_text())
    teller.click(".players-menu summary")
    names = teller.locator(".players-menu__panel li").all_inner_texts()
    check("The player count opens the players' names", any("Wren" in n for n in names) and any("Bea" in n for n in names), str(names))
    teller.click(".players-menu summary")

    for answer in ["Bartholomew", "the Salt Marshes", "a lantern"]:
        teller.fill("#madlib-input", answer)
        teller.keyboard.press("Enter")
        teller.wait_for_timeout(400)
    teller.click("text=Begin the story")
    phones["Wren"].wait_for_selector(".turn-banner--mine", timeout=10000)
    check("The first player's phone says it's their call", "Wren" in phones["Bea"].locator(".turn-banner").inner_text())

    teller.wait_for_selector(".turn-line", timeout=10000)  # the stage's scene is up and taking keys
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
    teller = signed_in_context(browser, viewport={"width": 1280, "height": 900}).new_page()
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
        if phone is phones[0]:
            phone.click("text=Change my vote")
            phone.locator("button.dealt__card").nth(1).click()
            phone.click("button.join__button")
            phone.wait_for_selector("text=Your vote is in", timeout=10000)
            check("A player can change their vote while it's open", phone.locator(".dealt__card.is-picked").inner_text().startswith("II"))
    check("Phones show votes left, never the tally", phones[1].locator(".choice-card__votes").count() == 0)
    teller.wait_for_selector(".vote-tie", timeout=10000)
    check("A tie highlights both choices for the storyteller", teller.locator(".choice-card.is-favourite").count() == 2)



def flashing_checks(browser) -> None:
    """No flashing: chosen at Play, caps every phone, and the storyteller can switch it mid-game."""
    teller = signed_in_context(browser, viewport={"width": 1280, "height": 900}).new_page()
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
    phone.click("button[aria-label='Settings']")
    selected = phone.locator(".settings__row--effects .segmented__option.is-selected")
    check("No flashing caps a phone set to full effects", selected.inner_text().strip() == "Gentle", selected.inner_text())
    check("Full is locked while the table asks for no flashing", phone.locator("input[value='full']").is_disabled())
    if os.environ.get("E2E_SHOTS"):
        phone.wait_for_timeout(400)  # let the panel finish fading in
        phone.screenshot(path=os.environ["E2E_SHOTS"] + "/settings.png")

    teller.click("button[aria-pressed='true'][title='No flashing (all screens)']")
    phone.wait_for_selector(".settings__row--effects .segmented__option.is-selected:has-text('Full')", timeout=10000)
    check("The storyteller can turn flashing back on mid-game", True)

    phone.click(".settings__row--effects .segmented__option:has-text('Gentle')")
    check("A phone can choose its own level", selected.inner_text().strip() == "Gentle")
    phone.click("button[role='switch']")
    check("Dark mode is a switch in the same panel", phone.evaluate("document.documentElement.dataset.mode") == "light")


def roll_checks(browser) -> None:
    """The final roll: real dice by default; the storyteller can hand the app's d20 to one player."""
    story = call("/api/stories", {"title": "One Last Roll"})
    story["scenes"] = [{
        "id": "only", "title": "The Only Room", "base_text": "A door.",
        "choices": [{"kind": "item", "display_text": "Take it?", "result_text": "Taken.", "amount": 1, "item_name": "Brass Key"}],
    }]
    call(f"/api/stories/{story['id']}", story, method="PUT")
    started = call("/api/state/start", {"story_id": story["id"], "force": True, "turn_mode": "rotate"})
    token, session_id = started["token"], started["state"]["session_id"]

    phones = {}
    for name in ["Wren", "Ash"]:
        phone = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
        phone.goto(f"{B}/player/{session_id}")
        phone.wait_for_selector("text=What should we call you?", timeout=10000)
        phone.fill("input[aria-label='Your name']", name)
        phone.click("text=Join the table")
        phone.wait_for_selector("text=What should we call you?", state="detached", timeout=10000)
        phones[name] = phone
    call("/api/state/choice", {"choice_index": 0}, token)  # the last scene: the finale (one choice made: Ash's turn)

    teller = signed_in_context(browser, viewport={"width": 1280, "height": 900})
    teller.add_init_script(f"sessionStorage.setItem('jb_rpg_session_token', {json.dumps(token)})")
    stage = teller.new_page()
    stage.goto(B + "/run")
    stage.wait_for_selector(".rolls__input", timeout=10000)
    phone = phones["Wren"]
    phone.wait_for_selector(".phone-roll", timeout=10000)
    check("Real dice by default: the phone has no Roll button", phone.locator(".phone-roll__button").count() == 0)

    stage.fill(".rolls__input", "7")
    stage.keyboard.press("Enter")
    phone.wait_for_selector(".dice-card", timeout=10000)
    check("A real roll the storyteller enters plays on the phones", "7 + 1 = 8" in phone.locator(".dice-card__sum").inner_text())
    stage.click("text=Undo the last roll")
    stage.wait_for_selector(".rolls__input", timeout=10000)
    check("A mistyped roll can be taken back", call("/api/state", token=token, method="GET")["state"]["final_rolls"] == [])

    stage.click("text=Roll on the phones instead")
    phones["Ash"].wait_for_selector(".phone-roll__button", timeout=10000)
    check("The d20 goes to the player whose turn it is", True)
    phone.wait_for_selector("text=holds the die", timeout=10000)
    check("Everyone else sees who holds the die, with no Roll button",
          phone.locator(".phone-roll__button").count() == 0 and "Ash" in phone.locator(".phone-roll").inner_text())
    stage.click(".turn-line__pick button:text-is('Wren')")
    phone.wait_for_selector(".phone-roll__button", timeout=10000)
    phones["Ash"].wait_for_selector(".phone-roll__button", state="detached", timeout=10000)
    check("The storyteller can hand the die to someone else", True)
    phone.click(".phone-roll__button")
    phone.wait_for_selector(".dice-card", timeout=10000)
    check("The roll lands on the phones", True)
    stage.wait_for_selector(".rolls__die:not(:empty)", timeout=10000)
    rolled = call("/api/state", token=token, method="GET")["state"]["final_rolls"]
    check("The stage shows the number rolled", stage.locator(".rolls__die").first.inner_text() == str(rolled[0]))
    stage.wait_for_selector("text=Reveal to the table", timeout=10000)
    stage.click("text=Reveal to the table")
    phone.wait_for_selector(".phone-keepsake", timeout=15000)
    phone.click(".phone-keepsake")
    roll_line = phone.locator(".keepsake__roll-line")
    roll_line.wait_for(timeout=5000)
    check("The keepsake remembers the roll", roll_line.inner_text() == f"Rolled {rolled[0]}, with 1 to add", roll_line.inner_text())


def backpack_checks(browser) -> None:
    """An item in the backpack opens on its own card; closing it leaves the backpack open."""
    story = call("/api/stories", {"title": "Pockets"})
    room = lambda i, choices: {"id": f"r{i}", "title": f"Room {i}", "base_text": "A room.", "choices": choices}
    story["scenes"] = [
        room(1, [{"kind": "item", "display_text": "Take it?", "result_text": "Taken.", "amount": 1,
                  "item_name": "Brass Key", "item_description": "It opens nothing you have seen yet."}]),
        room(2, [{"kind": "level", "display_text": "Go on?", "result_text": "On.", "amount": 1}]),
    ]
    call(f"/api/stories/{story['id']}", story, method="PUT")
    started = call("/api/state/start", {"story_id": story["id"], "force": True})
    call("/api/state/choice", {"choice_index": 0}, started["token"])

    phone = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True).new_page()
    phone.goto(f"{B}/player/{started['state']['session_id']}")
    phone.wait_for_selector("[aria-label^='The backpack']", timeout=10000)
    phone.wait_for_timeout(4000)  # let the found-item card finish
    phone.click("[aria-label^='The backpack']")
    phone.click(".pack__open")
    phone.wait_for_selector(".item-dialog[open]", timeout=5000)
    check("An item opens on its own card", "It opens nothing you have seen yet." in phone.locator(".item-dialog__about").inner_text())
    phone.click(".item-dialog__close")
    phone.wait_for_timeout(300)
    check("The X goes back to the backpack", phone.locator(".item-dialog[open]").count() == 0 and phone.locator(".sheet[open]").count() == 1)
    phone.click(".pack__open")
    phone.mouse.click(10, 10)  # outside the card
    phone.wait_for_timeout(300)
    check("A tap outside goes back to the backpack", phone.locator(".item-dialog[open]").count() == 0 and phone.locator(".sheet[open]").count() == 1)
    phone.click(".pack__open")
    phone.keyboard.press("Escape")
    phone.wait_for_timeout(300)
    check("Escape goes back to the backpack", phone.locator(".item-dialog[open]").count() == 0 and phone.locator(".sheet[open]").count() == 1)
    phone.click(".pack__open")
    box = phone.locator(".item-dialog__card").bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + 40
    phone.locator(".item-dialog__card").dispatch_event("touchstart", {"touches": [{"identifier": 1, "clientX": x, "clientY": y}]})
    phone.locator(".item-dialog__card").dispatch_event("touchmove", {"touches": [{"identifier": 1, "clientX": x, "clientY": y + 160}]})
    phone.locator(".item-dialog__card").dispatch_event("touchend", {"touches": []})
    phone.wait_for_timeout(300)
    check("A swipe down goes back to the backpack", phone.locator(".item-dialog[open]").count() == 0 and phone.locator(".sheet[open]").count() == 1)


def door_checks(browser) -> None:
    """Taking turns in a story of doors: the player whose turn it is points at a door from their phone."""
    story = call("/api/stories", {"title": "Hallways"})
    room = lambda i: {"id": f"h{i}", "title": f"Hall {i}", "base_text": "A hall.", "choices": [
        {"kind": "level", "display_text": "On?", "result_text": "On.", "amount": 1}]}
    story["scenes"] = [room(1), room(2), room(3)]
    story["settings"] = {**story.get("settings", {}), "non_linear": True}
    call(f"/api/stories/{story['id']}", story, method="PUT")
    started = call("/api/state/start", {"story_id": story["id"], "force": True, "turn_mode": "rotate"})
    token, session_id = started["token"], started["state"]["session_id"]

    phone = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
    phone.goto(f"{B}/player/{session_id}")
    phone.fill("input[aria-label='Your name']", "Wren")
    phone.click("text=Join the table")
    phone.wait_for_selector(".turn-banner--mine", timeout=10000)
    call("/api/state/choice", {"choice_index": 0}, token)  # the first hall: on to the doors

    teller = signed_in_context(browser, viewport={"width": 1280, "height": 900})
    teller.add_init_script(f"sessionStorage.setItem('jb_rpg_session_token', {json.dumps(token)})")
    stage = teller.new_page()
    stage.goto(B + "/run")
    stage.wait_for_selector("text=Which door next?", timeout=10000)
    check("The stage says who chooses the door", "Wren decides the next door" in stage.locator(".turn-line").inner_text())

    check("The doors wait for the storyteller to deal them", phone.locator(".dealt__card").count() == 0)
    stage.click("text=Deal the doors to the table")
    phone.wait_for_selector("button.dealt__card", timeout=10000)
    check("Dealt, the decider's phone shows every door", phone.locator(".dealt__card").count() == 3 and phone.locator("button.dealt__card").count() == 2)
    check("The door already opened is dimmed", "Hall 1" in phone.locator(".dealt__card.is-dimmed").inner_text())
    phone.locator("button.dealt__card").nth(1).click()
    stage.wait_for_selector(".door.is-picked", timeout=10000)
    check("The decider's door shows on the stage", "Hall 3" in stage.locator(".door.is-picked").inner_text())
    stage.click(".door.is-picked")
    phone.wait_for_selector(".turn-banner--mine", timeout=10000)
    check("The one who chose the door decides the room behind it", call("/api/state", token=token, method="GET")["state"]["current_scene_id"] == "h3")


if __name__ == "__main__":
    sys.exit(main())
