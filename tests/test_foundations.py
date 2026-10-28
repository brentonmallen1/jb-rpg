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
    item = next(p for p in problems if p["field"] == "item_name")
    assert (item["area"], item["scene_id"], item["index"]) == ("scene", "b", 0)
    assert "'A' has no choices" in text
    assert "no item name" in text
    assert "no longer exists ('ghost')" in text
    assert "hero's health needs a comparison" in text

    resp = client.post("/api/state/start", json={"story_id": story["id"]})
    assert resp.status_code == 422
    assert "isn't ready to play" in resp.json()["detail"]


def test_a_finished_story_has_no_problems(client):
    story = make_story(client)
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


def test_admin_login_is_generated_when_none_is_configured(client):
    from app import auth, config, storage

    auth.ensure_admin_credentials()
    saved = json.loads((storage.STATE_FILE.parent / "admin.json").read_text())
    assert (config.ADMIN_USER, config.ADMIN_PASSWORD) == (saved["user"], saved["password"])
    assert client.get("/api/stories").status_code == 401
    assert client.get("/api/stories", headers=basic(saved["user"], saved["password"])).status_code == 200

    # Stable across restarts
    config.ADMIN_USER = config.ADMIN_PASSWORD = ""
    auth.ensure_admin_credentials()
    assert config.ADMIN_PASSWORD == saved["password"]


def test_no_login_is_generated_when_auth_is_disabled(client, monkeypatch):
    from app import auth, config, storage

    monkeypatch.setattr(config, "AUTH_DISABLED", True)
    auth.ensure_admin_credentials()
    assert config.ADMIN_USER == ""
    assert not (storage.STATE_FILE.parent / "admin.json").exists()
