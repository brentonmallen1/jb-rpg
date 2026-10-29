"""The table votes: players' preferences guide the storyteller, who still makes the choice."""

import asyncio

from .test_turns import SCENES


def begin(client, vote_seconds=60):
    story = client.post("/api/stories", json={"title": "Votes"}).json()
    story["scenes"] = SCENES
    story["settings"]["vote_seconds"] = vote_seconds
    client.put(f"/api/stories/{story['id']}", json=story)
    resp = client.post("/api/state/start", json={"story_id": story["id"], "turn_mode": "vote"})
    client.headers["X-Session-Token"] = resp.json()["token"]
    return resp.json()["state"]["session_id"]


def join(client, sid, name):
    return client.post("/api/session/join", json={"s": sid, "name": name}).json()


def vote(client, player, index):
    return client.post("/api/state/vote", json={"choice_index": index}, headers={"X-Player-Token": player["token"]})


def test_dealing_opens_the_vote_for_everyone_at_the_table(client):
    sid = begin(client)
    a, b = join(client, sid, "Ann"), join(client, sid, "Ben")
    assert client.get("/api/state").json()["resolved"]["vote"] is None  # not dealt yet

    client.post("/api/state/reveal-choices")
    v = client.get("/api/state").json()["resolved"]["vote"]
    assert v["open"] and v["voted"] == [] and 55 < v["ends_in"] <= 60
    assert sorted(v["eligible"]) == sorted([a["player"]["id"], b["player"]["id"]])

    late = join(client, sid, "Cal")
    assert vote(client, late, 0).status_code == 403  # joined after the vote began
    assert vote(client, a, 0).status_code == 200
    assert vote(client, a, 1).status_code == 200  # changed their mind: still one vote
    assert client.get("/api/state").json()["vote_tally"]["counts"] == {"1": 1}
    assert vote(client, b, 2).status_code == 200
    assert vote(client, a, 0).status_code == 409  # every vote is in: the vote has closed


def test_only_the_storyteller_sees_the_tally_and_ties_have_several_leaders(client):
    sid = begin(client)
    a, b, c = join(client, sid, "Ann"), join(client, sid, "Ben"), join(client, sid, "Cy")
    client.post("/api/state/reveal-choices")
    vote(client, a, 0)
    vote(client, b, 2)

    teller = client.get("/api/state").json()
    assert teller["vote_tally"] == {"counts": {"0": 1, "2": 1}, "leaders": [0, 2]}  # a tie
    assert "votes" not in teller["state"]
    assert teller["resolved"]["vote"]["voted"] == sorted([a["player"]["id"], b["player"]["id"]])

    phone = client.get(f"/api/state?s={sid}", headers={"X-Session-Token": ""}).json()
    assert "vote_tally" not in phone and "votes" not in phone["state"]

    vote(client, c, 2)
    teller = client.get("/api/state").json()
    assert teller["vote_tally"]["leaders"] == [2]
    assert teller["resolved"]["vote"]["open"] is False  # everyone voted


def test_tally_is_left_out_of_the_shared_stream(client):
    from app import sse

    sid = begin(client)
    join(client, sid, "Ann")
    client.post("/api/state/reveal-choices")
    public = asyncio.run(sse.build_payload())
    private = asyncio.run(sse.build_payload(for_storyteller=True))
    assert "vote_tally" not in public and private["vote_tally"] is not None


def test_votes_after_the_deadline_are_refused(client):
    from app import engine, storage

    sid = begin(client)
    a = join(client, sid, "Ann")
    client.post("/api/state/reveal-choices")
    state = storage.load_state()
    player = state.players[0]
    try:
        engine.cast_vote(state, player, 0, now=state.vote_deadline + 1)
        raise AssertionError("late vote accepted")
    except engine.GameError as e:
        assert e.status_code == 409
    assert vote(client, a, 0).status_code == 200  # still in time for real


def test_no_time_limit(client):
    sid = begin(client, vote_seconds=0)
    join(client, sid, "Ann")
    client.post("/api/state/reveal-choices")
    assert client.get("/api/state").json()["resolved"]["vote"]["ends_in"] is None


def test_removing_a_player_drops_their_vote(client):
    sid = begin(client)
    a, b = join(client, sid, "Ann"), join(client, sid, "Ben")
    client.post("/api/state/reveal-choices")
    vote(client, a, 1)
    client.delete(f"/api/state/players/{a['player']['id']}")
    teller = client.get("/api/state").json()
    assert teller["vote_tally"]["counts"] == {}
    assert teller["resolved"]["vote"]["eligible"] == [b["player"]["id"]]


def test_the_storyteller_can_choose_anything_and_the_next_scene_starts_fresh(client):
    sid = begin(client)
    a = join(client, sid, "Ann")
    client.post("/api/state/reveal-choices")
    vote(client, a, 0)
    assert client.post("/api/state/choice", json={"choice_index": 2}).status_code == 200  # override
    after = client.get("/api/state").json()
    assert after["resolved"]["vote"] is None and after["vote_tally"] is None
