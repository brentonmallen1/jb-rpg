"""The final roll: the app rolls the d20 when a player taps; each attempt is a level, each item adds one."""

import pytest

from app import engine
from app.engine import GameError

from .conftest import start
from .test_turns import SCENES, choice


def at_finale(client, items=0, levels=0):
    """A linear story whose last scene has been played, with the given items and extra levels."""
    scenes = [
        {"id": f"s{i}", "title": f"S{i}", "base_text": "Text.", "choices": [choice("item", f"i{i}"), choice("level", f"l{i}")]}
        for i in range(items + levels)
    ]
    story = client.post("/api/stories", json={"title": "Roll"}).json()
    story["scenes"] = scenes
    client.put(f"/api/stories/{story['id']}", json=story)
    started = start(client, story["id"])
    for i in range(items + levels):
        client.post("/api/state/choice", json={"choice_index": 0 if i < items else 1})
    client.post("/api/state/offer-roll", json={"offered": True})
    return started


def rolling(monkeypatch, *values):
    values = list(values)
    monkeypatch.setattr(engine.secrets, "randbelow", lambda n: values.pop(0) - 1)


def test_a_player_rolls_and_the_dice_decide(client, monkeypatch):
    at_finale(client, items=2, levels=1)  # bonus 2, two attempts
    sid = client.get("/api/state").json()["state"]["session_id"]
    assert client.get("/api/state").json()["resolved"]["final_roll"] == {"rolls": [], "bonus": 2, "attempts": 2, "target": 20, "offered": True}

    rolling(monkeypatch, 14, 19)
    state = client.post("/api/state/roll", json={"attempt": 0, "s": sid}, headers={"X-Session-Token": ""}).json()
    assert state["final_rolls"] == [14] and state["outcome"] is None  # 16: short, one attempt left

    state = client.post("/api/state/roll", json={"attempt": 1, "s": sid}, headers={"X-Session-Token": ""}).json()
    assert state["final_rolls"] == [14, 19]
    assert state["outcome"] == "victory" and state["outcome_revealed"] is False  # the storyteller tells it
    assert client.get("/api/state").json()["resolved"]["finale"] is True

    assert client.post("/api/state/roll", json={"attempt": 2, "s": sid}).status_code == 409  # decided
    client.post("/api/state/reveal-outcome")
    body = client.get("/api/state").json()
    assert body["state"]["outcome_revealed"] and body["resolved"]["final_roll"]["rolls"] == [14, 19]


def test_running_out_of_attempts_is_defeat(client, monkeypatch):
    at_finale(client, items=1)  # level 1: one attempt
    rolling(monkeypatch, 18)
    state = client.post("/api/state/roll", json={"attempt": 0}).json()
    assert state["outcome"] == "defeat"


def test_two_taps_at_once_spend_one_attempt(client, monkeypatch):
    at_finale(client, items=1, levels=2)
    rolling(monkeypatch, 3, 4)
    assert client.post("/api/state/roll", json={"attempt": 0}).status_code == 200
    assert client.post("/api/state/roll", json={"attempt": 0}).status_code == 409
    assert client.get("/api/state").json()["state"]["final_rolls"] == [3]


def test_only_the_table_may_roll(client):
    at_finale(client, items=1)
    client.headers.pop("X-Session-Token")
    assert client.post("/api/state/roll", json={"attempt": 0, "s": "nope"}).status_code == 403


def test_no_roll_before_the_finale_and_back_forgets_the_rolls(client, monkeypatch):
    at_finale(client, items=1, levels=1)
    client.post("/api/state/back")
    assert client.post("/api/state/roll", json={"attempt": 0}).status_code == 409  # mid-story

    client.post("/api/state/choice", json={"choice_index": 1})
    client.post("/api/state/offer-roll", json={"offered": True})
    rolling(monkeypatch, 2)
    client.post("/api/state/roll", json={"attempt": 0})
    client.post("/api/state/back")
    assert client.get("/api/state").json()["state"]["final_rolls"] == []


def test_a_finale_scene_is_rolled_for_too():
    from app.models import GameState, Story

    story = Story(id="f", title="F", madlib_template={"prompt": "", "fields": []}, scenes=[{"id": "end", "title": "End", "base_text": "", "is_finale": True}])
    state = GameState(story_id="f", current_scene_id="end", hp=3, status="running", story=story)
    with pytest.raises(GameError):
        engine.roll(state, 0)  # real dice until the storyteller offers the digital one
    engine.offer_roll(state, True)
    assert engine.roll(state, 0, rng=lambda: 20) == 20
    assert state.status.value == "game_over" and state.outcome == "victory"
    with pytest.raises(GameError):
        engine.roll(state, 1)


def test_the_storyteller_chooses_real_dice_or_the_digital_roll(client, monkeypatch):
    at_finale(client, items=1, levels=1)
    assert client.post("/api/state/offer-roll", json={"offered": False}).status_code == 200  # back to real dice
    assert client.post("/api/state/roll", json={"attempt": 0}).status_code == 409
    assert client.post("/api/state/finish", json={"outcome": "victory"}).json()["final_rolls"] == []

    client.post("/api/state/back")
    client.post("/api/state/choice", json={"choice_index": 1})
    assert client.get("/api/state").json()["state"]["roll_offered"] is False  # each finale starts with real dice
    client.post("/api/state/offer-roll", json={"offered": True})
    rolling(monkeypatch, 5)
    client.post("/api/state/roll", json={"attempt": 0})
    assert client.post("/api/state/offer-roll", json={"offered": False}).status_code == 409  # already rolling


def test_real_dice_rolls_are_entered_by_the_storyteller(client):
    at_finale(client, items=2, levels=1)
    client.post("/api/state/offer-roll", json={"offered": False})
    assert client.post("/api/state/record-roll", json={"attempt": 0, "value": 21}).status_code == 422
    state = client.post("/api/state/record-roll", json={"attempt": 0, "value": 12}).json()
    assert state["final_rolls"] == [12] and state["outcome"] is None
    assert client.post("/api/state/record-roll", json={"attempt": 0, "value": 12}).status_code == 409  # entered twice

    state = client.post("/api/state/record-roll", json={"attempt": 1, "value": 15}).json()
    assert state["outcome"] == "defeat" and state["outcome_revealed"] is False  # 17: short, out of attempts

    state = client.post("/api/state/undo-roll").json()  # a typo: it was an 18
    assert state["final_rolls"] == [12] and state["outcome"] is None
    state = client.post("/api/state/record-roll", json={"attempt": 1, "value": 18}).json()
    assert state["outcome"] == "victory"

    client.post("/api/state/reveal-outcome")
    assert client.post("/api/state/undo-roll").status_code == 409  # told: it stands


def test_phones_cannot_enter_rolls_and_digital_rolls_cannot_be_typed(client):
    at_finale(client, items=1)  # the digital roll is offered
    assert client.post("/api/state/record-roll", json={"attempt": 0, "value": 20}).status_code == 409
    client.headers.pop("X-Session-Token")
    assert client.post("/api/state/record-roll", json={"attempt": 0, "value": 20}).status_code == 403
