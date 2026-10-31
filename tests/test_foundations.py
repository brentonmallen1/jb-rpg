"""Phase 1 robustness: atomic writes, story snapshots, persisted tokens, start/resume, SSE."""

import asyncio
import base64
import json

import pytest
from fastapi.testclient import TestClient

from .conftest import start


def scene(sid, *kinds):
    choices = [
        {"kind": k, "display_text": f"{sid}-{k}", "result_text": "r", **({"item_name": f"{sid}-item"} if k == "item" else {})}
        for k in kinds
    ]
    return {"id": sid, "title": sid.upper(), "base_text": f"Scene {sid}.", "choices": choices}


def make_story(client, scenes=None, **extra):
    story = client.post("/api/stories", json={"title": "Test"}).json()
    story["scenes"] = scenes if scenes is not None else [scene("a", "level", "damage"), scene("b", "item")]
    story.update(extra)
    assert client.put(f"/api/stories/{story['id']}", json=story).status_code == 200
    return story


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


def test_write_json_is_atomic(tmp_path):
    from app.storage import write_json

    path = tmp_path / "x.json"
    write_json(path, {"ok": 1})
    with pytest.raises(TypeError):
        write_json(path, {"bad": object()})  # not serialisable: fails mid-write
    assert json.loads(path.read_text()) == {"ok": 1}  # original untouched
    assert [p.name for p in tmp_path.iterdir()] == ["x.json"]  # no temp files left behind


def test_corrupt_state_file_means_no_session(client):
    from app import storage

    storage.STATE_FILE.write_text("{not json")
    assert storage.load_state() is None
    assert client.get("/api/session/check").json()["active"] is False


# ---------------------------------------------------------------------------
# Story snapshot
# ---------------------------------------------------------------------------


def test_editing_a_story_mid_game_does_not_affect_the_session(client):
    story = make_story(client)
    start(client, story["id"])

    # Rip out every choice in the saved story
    story["scenes"] = [dict(s, choices=[]) for s in story["scenes"]]
    story["title"] = "Edited"
    client.put(f"/api/stories/{story['id']}", json=story)

    assert client.post("/api/state/choice", json={"choice_index": 0}).status_code == 200
    snapshot = client.get("/api/state/story").json()
    assert snapshot["title"] == "Test"
    assert len(snapshot["scenes"][0]["choices"]) == 2


def test_clients_never_receive_the_snapshot_or_token_hash(client):
    story = make_story(client)
    data = start(client, story["id"]).json()
    for state in (data["state"], client.get("/api/state").json()["state"],
                  client.post("/api/state/reveal-choices").json()):
        assert "story" not in state
        assert "token_hash" not in state


def test_story_snapshot_requires_the_storyteller(client):
    start(client, make_story(client)["id"])
    assert client.get("/api/state/story", headers={"X-Session-Token": "nope"}).status_code == 403


# ---------------------------------------------------------------------------
# Starting, resuming, surviving restarts
# ---------------------------------------------------------------------------


def test_storyteller_token_survives_a_server_restart(client):
    from app.main import app

    start(client, make_story(client)["id"])
    token = client.headers["X-Session-Token"]
    with TestClient(app) as restarted:  # runs startup again; state.json must persist
        resp = restarted.post("/api/state/reveal-choices", headers={"X-Session-Token": token})
        assert resp.status_code == 200


def test_start_refuses_to_replace_a_running_session_unless_forced(client):
    first = make_story(client)
    second = make_story(client)
    start(client, first["id"])

    resp = client.post("/api/state/start", json={"story_id": second["id"]})
    assert resp.status_code == 409
    assert "already running" in resp.json()["detail"]

    assert start(client, second["id"], force=True).status_code == 200
    assert client.get("/api/state").json()["state"]["story_id"] == second["id"]


def test_resume_hands_control_to_a_new_tab(client):
    start(client, make_story(client)["id"])
    old_token = client.headers.pop("X-Session-Token")

    resp = client.post("/api/state/resume")
    assert resp.status_code == 200
    new_token = resp.json()["token"]

    assert client.post("/api/state/reveal-choices", headers={"X-Session-Token": new_token}).status_code == 200
    assert client.post("/api/state/reveal-choices", headers={"X-Session-Token": old_token}).status_code == 403


def test_resume_without_a_session_is_404(client):
    assert client.post("/api/state/resume").status_code == 404


# ---------------------------------------------------------------------------
# Story problems
# ---------------------------------------------------------------------------


def test_problems_are_reported_but_saving_still_works(client):
    story = make_story(client, scenes=[
        scene("a"),  # no choices, not a finale
        {**scene("b", "item"), "choices": [{"kind": "item", "display_text": "x", "result_text": "y"}]},
        {**scene("c", "level"), "conditional_text": [
            {"condition": {"type": "scene_outcome", "scene_id": "ghost", "outcome": "item"}, "text": "t"},
            {"condition": {"type": "hp"}, "text": "t"},
        ]},
    ])
    problems = client.get(f"/api/stories/{story['id']}/problems").json()["problems"]
    text = " ".join(p["message"] for p in problems)
    item = next(p for p in problems if p["field"] == "item_id")
    assert (item["area"], item["scene_id"], item["index"]) == ("scene", "b", 0)
    assert "'A' has no choices" in text
    assert "an item choice has no item" in text
    assert "no longer exists ('ghost')" in text
    assert "hero's health needs a comparison" in text

    resp = client.post("/api/state/start", json={"story_id": story["id"]})
    assert resp.status_code == 422
    assert "isn't ready to play" in resp.json()["detail"]


def test_a_finished_story_has_no_problems(client):
    # Fewer lives than chances to lose one (more would be worth a look: the party couldn't run out)
    hurt = [scene(sid, "level", "damage") for sid in "abcd"]
    story = make_story(client, hurt)
    assert client.get(f"/api/stories/{story['id']}/problems").json() == {"problems": []}


# ---------------------------------------------------------------------------
# Admin observers
# ---------------------------------------------------------------------------


def basic(user, password):
    return {"Authorization": "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()}


def test_admins_can_watch_a_session_when_admin_auth_is_configured(client, monkeypatch):
    from app import config

    start(client, make_story(client)["id"])
    client.headers.pop("X-Session-Token")
    assert client.get("/api/state").status_code == 403  # no admin auth configured: no observers

    monkeypatch.setattr(config, "ADMIN_USER", "gm")
    monkeypatch.setattr(config, "ADMIN_PASSWORD", "pw")
    assert client.get("/api/state", headers=basic("gm", "pw")).status_code == 200
    assert client.get("/api/state", headers=basic("gm", "wrong")).status_code == 403


# ---------------------------------------------------------------------------
# SSE
# ---------------------------------------------------------------------------


def test_sse_counts_players_and_sends_heartbeats(client, monkeypatch):
    from app import config, sse

    start(client, make_story(client)["id"])
    monkeypatch.setattr(config, "SSE_HEARTBEAT_SECONDS", 0.05)

    async def scenario():
        player = sse.stream("player")
        observer = sse.stream("observer")
        first = json.loads((await player.__anext__())[len("data: "):])
        assert first["player_count"] == 1
        await observer.__anext__()
        assert list(sse.connections.values()).count("player") == 1

        await player.__anext__()  # the broadcast announcing the player
        assert await player.__anext__() == "event: ping\ndata: {}\n\n"

        await sse.end_session()
        rest = [m async for m in player]
        assert '"session_ended"' in rest[0]
        await observer.aclose()

    asyncio.run(scenario())
    assert sse.connections == {}


def test_admin_login_is_generated_when_none_is_configured(client, caplog):
    import re

    from app import auth, config, storage

    auth.ensure_admin_credentials()
    path = storage.STATE_FILE.parent / "admin.json"
    saved = json.loads(path.read_text())
    user, password = re.search(r"Storyteller login: (\S+) / (\S+)\.", caplog.text).groups()
    assert saved["user"] == user and "password" not in saved  # only a hash is kept
    assert password not in path.read_text()
    assert client.get("/api/stories").status_code == 401
    assert client.get("/api/stories", headers=basic(user, password)).status_code == 200

    # Stable across restarts, and the password isn't logged again
    caplog.clear()
    config.ADMIN_USER = config.ADMIN_PASSWORD_HASH = ""
    auth.ensure_admin_credentials()
    assert password not in caplog.text
    assert client.get("/api/stories", headers=basic(user, password)).status_code == 200


def test_an_older_admin_json_keeps_only_the_hash(client):
    from app import auth, storage

    path = storage.STATE_FILE.parent / "admin.json"
    path.write_text(json.dumps({"user": "admin", "password": "old-secret"}))
    auth.ensure_admin_credentials()
    assert "old-secret" not in path.read_text()
    assert client.get("/api/stories", headers=basic("admin", "old-secret")).status_code == 200


def test_no_login_is_generated_when_auth_is_disabled(client, monkeypatch):
    from app import auth, config, storage

    monkeypatch.setattr(config, "AUTH_DISABLED", True)
    auth.ensure_admin_credentials()
    assert config.ADMIN_USER == ""
    assert not (storage.STATE_FILE.parent / "admin.json").exists()


def test_a_phone_that_reconnects_counts_once(client):
    """A locked phone's stream can linger; the same device connecting again replaces it."""
    from app import sse

    start(client, make_story(client)["id"])

    async def scenario():
        asleep = sse.stream("player", device="phone-1")
        await asleep.__anext__()
        awake = sse.stream("player", device="phone-1")
        first = json.loads((await awake.__anext__())[len("data: "):])
        assert first["player_count"] == 1
        # The old stream is told to close
        rest = [m async for m in asleep]
        assert all("session_ended" not in m for m in rest)
        other = sse.stream("player", device="phone-2")
        assert json.loads((await other.__anext__())[len("data: "):])["player_count"] == 2
        await sse.end_session()
        [m async for m in awake]
        [m async for m in other]

    asyncio.run(scenario())
    assert sse.connections == {} and sse.devices == {}


def test_access_logs_leave_out_game_links_and_tokens():
    import logging

    from app.main import RedactAccessLog

    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d', (
        "1.2.3.4:5", "GET", "/api/events?s=secret-session&p=player-token&d=dev", "1.1", 200), None)
    RedactAccessLog().filter(record)
    line = record.getMessage()
    assert "secret-session" not in line and "player-token" not in line and "s=…" in line

    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s"', ("1.2.3.4:5", "GET", "/player/abc123"), None)
    RedactAccessLog().filter(record)
    assert record.getMessage().endswith('"GET /player/…"')


def test_the_library_says_whats_left_to_fix_and_worth_a_look(client):
    make_story(client)  # 3 lives, one scene that can cost one
    make_story(client, [])
    found = {(s["errors"], tuple(s["warnings"])) for s in client.get("/api/stories").json() if s["title"] == "Test"}
    assert found == {(0, ("Lives exceed the choices that cost one (1).",)), (1, ())}
