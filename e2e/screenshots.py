"""README screenshots: `just screenshots` (throwaway servers and data, like the e2e run).

Plays a short game of the demo story and saves PNGs to docs/images/screenshots/.
"""

import base64
import json
import shutil
import subprocess
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

from run import A, B, BACKEND_PORT, FRONTEND_PORT, ROOT, STORY, call, launch, port_in_use, signed_in_context, start_backend, stop, wait_for

OUT = ROOT / "docs" / "images" / "screenshots"
DESKTOP = {"width": 1440, "height": 900}
PHONE = {"width": 390, "height": 844}
ANSWERS = ["Wren Ashdown", "the Salt Marshes", "a brass lantern"]
PHONE_THEMES = ["deep_space", "fantasy", "horror", "cyberpunk"]
BRANCHING = "demo-drowned-bell"


def as_player(path: str, body: dict, player_token: str) -> None:
    req = urllib.request.Request(
        A + path, data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "X-Player-Token": player_token},
    )
    urllib.request.urlopen(req)


def new_game(story_id: str, turn_mode: str = "storyteller") -> tuple[str, str]:
    """Start a game, create the hero and play the first scene, so the second scene has some history."""
    started = call("/api/state/start", {"story_id": story_id, "force": True, "turn_mode": turn_mode})
    token, session_id = started["token"], started["state"]["session_id"]
    for answer in ANSWERS:
        call("/api/state/madlib", {"answer": answer}, token)
    call("/api/state/proceed-from-character", token=token)
    call("/api/state/reveal-choices?show_to_players=false", token=token)
    call("/api/state/choice", {"choice_index": 0}, token)
    return token, session_id


def settings(token: str | None = None, mode: str = "dark", presentation: bool = False) -> str:
    script = f"localStorage.setItem('jb_rpg_color_mode','{mode}'); localStorage.setItem('jb_rpg_presentation','{'on' if presentation else 'off'}');"
    if token:
        script += f"sessionStorage.setItem('jb_rpg_session_token','{token}');"
    return script


def shoot(browser, url: str, name: str, *, viewport=DESKTOP, init: str = "", ready: str, signed_in=True, before=None) -> None:
    ctx = signed_in_context(browser, viewport=viewport, device_scale_factor=2) if signed_in else browser.new_context(viewport=viewport, device_scale_factor=2)
    ctx.add_init_script(init)
    page = ctx.new_page()
    page.goto(url)
    page.wait_for_selector(ready, timeout=15000)
    if before:
        before(page)
    page.wait_for_timeout(3500)  # let entrances and moments settle
    page.screenshot(path=str(OUT / f"{name}.png"))
    ctx.close()
    print("saved", name)


def compose_phones(browser) -> None:
    """The phone shots side by side, in one image."""
    def data_uri(theme: str) -> str:
        return "data:image/png;base64," + base64.b64encode((OUT / f"phone-{theme}.png").read_bytes()).decode()

    cells = "".join(f"<img src='{data_uri(t)}'>" for t in PHONE_THEMES)
    html = (
        "<html><body style='margin:0;padding:40px;background:#18171a;display:flex;gap:28px'>"
        "<style>img{width:300px;border-radius:28px;box-shadow:0 20px 50px rgb(0 0 0/.5)}</style>"
        f"{cells}</body></html>"
    )
    page = browser.new_page(viewport={"width": 40 * 2 + 300 * 4 + 28 * 3, "height": 40 * 2 + 650}, device_scale_factor=2)
    page.set_content(html)
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "phones.png"))
    page.close()
    for t in PHONE_THEMES:
        (OUT / f"phone-{t}.png").unlink()
    print("saved phones")


def open_road(page) -> None:
    """The Flow view with the Sunken Road open beside it: its route to the stair, and where it goes otherwise."""
    page.click(".react-flow__node[data-id='scene_sunken_road']")
    page.wait_for_selector(".editor__drawer .ed-title-input")
    page.click(".fl-toolbar button:text-is('Fit')")
    page.wait_for_timeout(600)
    # Close enough to read: from the prologue to the dark water
    box = page.locator(".react-flow__node[data-id='opening']").bounding_box()
    page.mouse.move(box["x"], box["y"] + box["height"] / 2)
    for _ in range(4):
        page.mouse.wheel(0, -120)
        page.wait_for_timeout(150)
    page.mouse.move(5, 5)


def take(browser) -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # The demo in each phone theme, so the library has a few covers
    demo = call(f"/api/stories/{STORY}", method="GET")
    theme_story = {demo["theme"]: STORY}
    for theme in PHONE_THEMES:
        if theme not in theme_story:
            title = f"{demo['title']} · {theme.replace('_', ' ').title()}"
            theme_story[theme] = call("/api/stories/import", {**demo, "id": f"shot-{theme}", "theme": theme, "title": title})["id"]

    for mode in ("dark", "light"):
        shoot(browser, B + "/", f"library-{mode}", init=settings(mode=mode), ready=".cover")
        shoot(
            browser, f"{B}/editor/{STORY}", f"editor-{mode}", init=settings(mode=mode), ready="text=The Village Gate",
            before=lambda page: page.click("nav >> text=The Chasm Bridge"),
        )
        shoot(
            browser, f"{B}/editor/{BRANCHING}", f"flow-{mode}",
            init=settings(mode=mode) + "localStorage.setItem('jb_rpg_editor_view','flow');", ready=".fl-scene",
            before=open_road,
        )

    # A voting game: two phones have voted on the second scene
    token, session_id = new_game(STORY, "vote")
    players = [call("/api/session/join", {"s": session_id, "name": name}) for name in ("Ann", "Ben", "Cy")]
    call("/api/state/reveal-choices?show_to_players=true", token=token)
    as_player("/api/state/vote", {"choice_index": 1}, players[0]["token"])
    as_player("/api/state/vote", {"choice_index": 1}, players[1]["token"])
    phones = browser.new_context(viewport=PHONE)  # the table's phones are connected
    for _ in players:
        phones.new_page().goto(f"{B}/player/{session_id}")
    shoot(browser, B + "/run", "stage", init=settings(token), ready=".choice-card__votes")
    shoot(browser, B + "/run", "presentation", init=settings(token, presentation=True), ready=".choice-card")
    phones.close()

    # The same moment on phones, in four themes
    for theme in PHONE_THEMES:
        token, session_id = new_game(theme_story[theme])
        call("/api/state/reveal-choices?show_to_players=true", token=token)
        teller = signed_in_context(browser, viewport=DESKTOP)  # the storyteller is at the table
        teller.add_init_script(settings(token))
        teller.new_page().goto(B + "/run")
        shoot(browser, f"{B}/player/{session_id}", f"phone-{theme}", viewport=PHONE, init=settings(), ready=".dealt__card", signed_in=False)
        teller.close()
    compose_phones(browser)


def main() -> int:
    busy = [port for port in (BACKEND_PORT, FRONTEND_PORT) if port_in_use(port)]
    if busy:
        print(f"Ports {busy} are in use. Stop those processes first.")
        return 1
    data_dir = Path(tempfile.mkdtemp(prefix="jb-rpg-shots-"))
    (data_dir / "stories").mkdir()
    for story in (STORY, BRANCHING):
        shutil.copy(ROOT / "data" / "stories" / f"{story}.json", data_dir / "stories")
    backend = start_backend(data_dir)
    frontend = subprocess.Popen(
        ["npx", "vite", "--port", str(FRONTEND_PORT), "--strictPort"],
        cwd=ROOT / "frontend", env={**os.environ, "BACKEND_PORT": str(BACKEND_PORT)},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    try:
        wait_for(B)
        with sync_playwright() as p:
            browser = launch(p)
            take(browser)
            browser.close()
    finally:
        stop(frontend)
        stop(backend)
        shutil.rmtree(data_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
