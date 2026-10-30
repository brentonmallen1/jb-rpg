"""The final roll: the app rolls the d20 when the storyteller (or the player holding the die) taps;
each attempt is a level, each item adds one."""

import pytest

from app import engine
from app.engine import GameError

from .test_turns import choice, join


@pytest.fixture(autouse=True)
def no_pause(monkeypatch):
    """Rolls in these tests come back to back; the pause between them has its own test."""
    monkeypatch.setattr(engine, "ROLL_PAUSE", 0)


def at_finale(client, items=0, levels=0, mode="storyteller", names=()):
    """A linear story whose last scene has been played, with the given items and extra levels.
    Returns the players' tokens by name (games with names)."""
    scenes = [
        {"id": f"s{i}", "title": f"S{i}", "base_text": "Text.", "choices": [choice("item", f"i{i}"), choice("level", f"l{i}")]}
        for i in range(items + levels)
    ]
    story = client.post("/api/stories", json={"title": "Roll"}).json()
    story["scenes"] = scenes
    client.put(f"/api/stories/{story['id']}", json=story)
    started = client.post("/api/state/start", json={"story_id": story["id"], "turn_mode": mode}).json()
    client.headers["X-Session-Token"] = started["token"]
    tokens = {name: join(client, started["state"]["session_id"], name).json()["token"] for name in names}
    for i in range(items + levels):
        client.post("/api/state/choice", json={"choice_index": 0 if i < items else 1})
    client.post("/api/state/offer-roll", json={"offered": True})
    return tokens


def rolling(monkeypatch, *values):
    values = list(values)
    monkeypatch.setattr(engine.secrets, "randbelow", lambda n: values.pop(0) - 1)


def as_phone(client, sid, attempt, token=None):
    headers = {"X-Session-Token": ""} | ({"X-Player-Token": token} if token else {})
    return client.post("/api/state/roll", json={"attempt": attempt, "s": sid}, headers=headers)


def test_the_storyteller_rolls_and_the_dice_decide(client, monkeypatch):
    at_finale(client, items=2, levels=1)  # bonus 2, two attempts
    expected = {"rolls": [], "bonus": 2, "attempts": 2, "target": 20, "offered": True, "roller": None}
    assert client.get("/api/state").json()["resolved"]["final_roll"] == expected

    rolling(monkeypatch, 14, 19)
    state = client.post("/api/state/roll", json={"attempt": 0}).json()
    assert state["final_rolls"] == [14] and state["outcome"] is None  # 16: short, one attempt left

    state = client.post("/api/state/roll", json={"attempt": 1}).json()
    assert state["final_rolls"] == [14, 19]
    assert state["outcome"] == "victory" and state["outcome_revealed"] is False  # the storyteller tells it
    assert client.get("/api/state").json()["resolved"]["finale"] is True

    assert client.post("/api/state/roll", json={"attempt": 2}).status_code == 409  # decided
    client.post("/api/state/reveal-outcome")
    body = client.get("/api/state").json()
    assert body["state"]["outcome_revealed"] and body["resolved"]["final_roll"]["rolls"] == [14, 19]


def test_without_names_no_phone_can_roll(client):
    at_finale(client, items=1, levels=1)
    sid = client.get("/api/state").json()["state"]["session_id"]
    assert as_phone(client, sid, 0).status_code == 403  # the session link alone isn't the die
    assert client.post("/api/state/roller", json={"player_id": None}).status_code == 409  # nobody to hand it to


def test_the_die_goes_to_whoever_s_turn_it_is(client, monkeypatch):
    tokens = at_finale(client, items=1, levels=2, mode="rotate", names=("Wren", "Ash"))
    body = client.get("/api/state").json()
    sid = body["state"]["session_id"]
    holder = body["resolved"]["final_roll"]["roller"]
    assert holder["name"] == "Ash"  # three choices made: the turn has come round to the second player

    rolling(monkeypatch, 3, 4, 5)
    assert as_phone(client, sid, 0, tokens["Wren"]).status_code == 403  # not in her hands
    assert as_phone(client, sid, 0, tokens["Ash"]).json()["final_rolls"] == [3]

    wren = next(p["id"] for p in body["state"]["players"] if p["name"] == "Wren")
    client.post("/api/state/roller", json={"player_id": wren})  # the storyteller passes it on
    assert as_phone(client, sid, 1, tokens["Ash"]).status_code == 403
    assert as_phone(client, sid, 1, tokens["Wren"]).json()["final_rolls"] == [3, 4]
    assert client.post("/api/state/roll", json={"attempt": 2}).json()["final_rolls"] == [3, 4, 5]  # the stage can always roll


def test_picking_who_rolls(client):
    tokens = at_finale(client, items=1, mode="pick", names=("Wren",))
    body = client.get("/api/state").json()
    assert body["resolved"]["final_roll"]["roller"] is None  # the storyteller hands it to someone
    sid = body["state"]["session_id"]
    assert as_phone(client, sid, 0, tokens["Wren"]).status_code == 403
    assert client.post("/api/state/roller", json={"player_id": "nobody"}).status_code == 404

    wren = body["state"]["players"][0]["id"]
    client.post("/api/state/roller", json={"player_id": wren})
    client.delete(f"/api/state/players/{wren}")  # she left the table: the die comes back to the stage
    assert client.get("/api/state").json()["state"]["roller_id"] is None


def test_each_roll_lands_before_the_next(monkeypatch):
    from app.models import GameState, Story

    monkeypatch.setattr(engine, "ROLL_PAUSE", 3.0)
    story = Story(id="f", title="F", madlib_template={"prompt": "", "fields": []}, scenes=[{"id": "end", "title": "End", "base_text": "", "is_finale": True}])
    state = GameState(story_id="f", current_scene_id="end", hp=3, level=3, status="running", story=story)
    engine.offer_roll(state, True)
    engine.roll(state, 0, rng=lambda: 2, now=100.0)
    with pytest.raises(GameError) as err:
        engine.roll(state, 1, rng=lambda: 2, now=101.0)
    assert err.value.status_code == 409 and state.final_rolls == [2]
    engine.roll(state, 1, rng=lambda: 2, now=103.5)
    assert state.final_rolls == [2, 2]


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
    assert client.post("/api/state/roll", json={"attempt": 0}, headers={"X-Player-Token": "nope"}).status_code == 403


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
