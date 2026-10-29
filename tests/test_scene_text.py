"""Phones get a scene's words with its choices, while the storyteller tells it; the stage always has them."""

import asyncio

from .test_turns import begin


def phone(client, sid):
    return client.get(f"/api/state?s={sid}", headers={"X-Session-Token": ""}).json()["resolved"]


def test_phones_wait_for_the_deal_to_read_the_scene(client):
    sid = begin(client, "storyteller")

    teller = client.get("/api/state").json()["resolved"]
    assert teller["scene_text"] == "Scene 1."
    held = phone(client, sid)
    assert held["scene_text"] is None and held["scene_text_pending"] is True
    assert held["scene_title"] == "S1"  # the title is the storyteller's to announce

    client.post("/api/state/reveal-choices?show_to_players=false")
    told = phone(client, sid)  # the choices are up on the stage: the scene has been told
    assert told["scene_text"] == "Scene 1." and "scene_text_pending" not in told
    assert told["visible_choices"] == []  # the choices themselves still wait for the deal


def test_dealing_straight_away_releases_the_words_too(client):
    sid = begin(client, "storyteller")
    client.post("/api/state/reveal-choices?show_to_players=true")
    assert phone(client, sid)["scene_text"] == "Scene 1."


def test_the_live_stream_holds_the_text_for_phones_only(client):
    from app import sse

    begin(client, "storyteller")
    public = asyncio.run(sse.build_payload())
    private = asyncio.run(sse.build_payload(for_storyteller=True))
    assert public["resolved"]["scene_text"] is None
    assert private["resolved"]["scene_text"] == "Scene 1."


def test_the_backpack_remembers_where_each_item_was_found(client):
    sid = begin(client, "storyteller")
    client.post("/api/state/reveal-choices?show_to_players=true")
    state = client.get("/api/state").json()["state"]
    item_at = next(v for v, i in enumerate(state["shuffled_indices"]) if i == 1)  # SCENES: index 1 finds an item
    client.post("/api/state/choice", json={"choice_index": item_at})
    assert phone(client, sid)["items_found"] == [{"name": "i1-item", "scene_title": "S1"}]


def test_the_journey_arrives_when_the_story_ends(client):
    sid = begin(client, "storyteller")
    assert "journey" not in phone(client, sid)
    for _ in range(4):  # play every scene through
        client.post("/api/state/reveal-choices?show_to_players=true")
        client.post("/api/state/choice", json={"choice_index": 0})
    journey = phone(client, sid)["journey"]
    assert [step["scene_title"] for step in journey] == ["S1", "S2", "S3", "S4"]
    assert {step["outcome"] for step in journey} <= {"level", "item", "damage"}
