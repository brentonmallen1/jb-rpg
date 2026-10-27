"""Regression tests for session bugs found in the 2026-10-26 audit."""

from .conftest import start


def choice(kind, text, item_name=None):
    c = {"kind": kind, "display_text": text, "result_text": f"{text} happens", "amount": 1}
    if item_name:
        c["item_name"] = item_name
    return c


def make_story(client, scenes, theme="fantasy", opening_scene=None):
    story = client.post("/api/stories", json={"title": "Test"}).json()
    story["scenes"] = scenes
    story["theme"] = theme
    if opening_scene:
        story["opening_scene"] = opening_scene
    resp = client.put(f"/api/stories/{story['id']}", json=story)
    assert resp.status_code == 200
    return story["id"]


TWO_SCENES = [
    {"id": "a", "title": "A", "base_text": "Scene A.", "choices": [choice("level", "a1")]},
    {
        "id": "b",
        "title": "B",
        "base_text": "Scene B.",
        "choices": [choice("damage", "b1"), choice("item", "b2", "Key"), choice("level", "b3")],
    },
]


def test_restart_requires_storyteller_token(client):
    start(client, make_story(client, TWO_SCENES))
    assert client.post("/api/state/restart", headers={"X-Session-Token": "wrong"}).status_code == 403
    assert client.post("/api/state/restart").status_code == 200


def test_back_resets_the_next_scenes_shuffle(client):
    start(client, make_story(client, TWO_SCENES))
    client.post("/api/state/choice", json={"choice_index": 0})  # A -> B
    client.post("/api/state/reveal-choices")  # shuffle B's three choices

    state = client.post("/api/state/back").json()
    assert state["current_scene_id"] == "a"
    assert state["shuffled_indices"] == []
    assert state["choices_revealed"] is False

    # Used to raise IndexError: B's shuffle applied to A's single choice
    assert client.post("/api/state/choice", json={"choice_index": 0}).status_code == 200


def test_back_from_defeat_clears_revealed_outcome(client):
    scenes = [{"id": "a", "title": "A", "base_text": "A.", "choices": [choice("damage", "hurt")]}]
    story_id = client.post("/api/stories", json={"title": "T"}).json()["id"]
    story = client.get(f"/api/stories/{story_id}").json()
    story["scenes"] = scenes
    story["settings"]["starting_hp"] = 1
    client.put(f"/api/stories/{story_id}", json=story)
    start(client, story_id)

    assert client.post("/api/state/choice", json={"choice_index": 0}).json()["outcome_revealed"] is True
    state = client.post("/api/state/back").json()
    assert state["outcome"] is None
    assert state["outcome_revealed"] is False


def test_players_get_choice_text_only_after_reveal(client):
    start(client, make_story(client, TWO_SCENES, theme="horror"))
    client.post("/api/state/choice", json={"choice_index": 0})  # -> B

    resolved = client.get("/api/state").json()["resolved"]
    assert resolved["theme"] == "horror"
    assert resolved["visible_choices"] == []

    # Storyteller-only shuffle doesn't show anything to players
    client.post("/api/state/reveal-choices?show_to_players=false")
    assert client.get("/api/state").json()["resolved"]["visible_choices"] == []

    state = client.post("/api/state/reveal-choices?show_to_players=true").json()
    resolved = client.get("/api/state").json()["resolved"]
    expected = [TWO_SCENES[1]["choices"][i]["display_text"] for i in state["shuffled_indices"]]
    assert resolved["visible_choices"] == expected
    assert "result_text" not in str(resolved)


def test_config_does_not_leak_session_id(client):
    session_id = start(client, make_story(client, TWO_SCENES)).json()["state"]["session_id"]
    assert "session_id" not in client.get("/api/config").json()

    assert client.get("/api/session/check").json() == {"active": True, "valid": False}
    assert client.get("/api/session/check?s=nope").json() == {"active": True, "valid": False}
    assert client.get(f"/api/session/check?s={session_id}").json() == {"active": True, "valid": True}

    client.post("/api/state/restart")
    assert client.get(f"/api/session/check?s={session_id}").json() == {"active": False, "valid": False}


def test_players_need_matching_session_for_state(client):
    session_id = start(client, make_story(client, TWO_SCENES)).json()["state"]["session_id"]
    client.headers.pop("X-Session-Token")
    assert client.get("/api/state").status_code == 403
    assert client.get("/api/state?s=nope").status_code == 403
    assert client.get(f"/api/state?s={session_id}").status_code == 200


def test_update_story_rejects_mismatched_id(client):
    story = client.post("/api/stories", json={"title": "T"}).json()
    other = dict(story, id="someone-else")
    assert client.put(f"/api/stories/{story['id']}", json=other).status_code == 422
    assert client.get(f"/api/stories/{story['id']}").json()["id"] == story["id"]


def test_opening_conditional_text_is_space_separated(client):
    opening = {
        "title": "Start",
        "base_text": "You wake.",
        "conditional_text": [
            {"condition": {"type": "hp", "op": "gte", "value": 1}, "text": "You feel fine."}
        ],
    }
    start(client, make_story(client, TWO_SCENES, opening_scene=opening))
    resolved = client.get("/api/state").json()["resolved"]
    assert resolved["scene_text"] == "You wake. You feel fine."
