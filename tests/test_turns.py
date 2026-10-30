"""Who makes each choice: the storyteller (default), players in turn, or a player the storyteller picks."""

from .conftest import start


def choice(kind, text):
    c = {"kind": kind, "display_text": text, "result_text": f"{text}!", "amount": 1}
    if kind == "item":
        c["item_name"] = f"{text}-item"
    return c


SCENES = [
    {"id": f"s{i}", "title": f"S{i}", "base_text": f"Scene {i}.",
     "choices": [choice("level", f"l{i}"), choice("item", f"i{i}"), choice("level", f"m{i}")]}
    for i in range(1, 5)
]


def begin(client, mode):
    story = client.post("/api/stories", json={"title": "Turns"}).json()
    story["scenes"] = SCENES
    client.put(f"/api/stories/{story['id']}", json=story)
    resp = client.post("/api/state/start", json={"story_id": story["id"], "turn_mode": mode})
    assert resp.status_code == 200
    client.headers["X-Session-Token"] = resp.json()["token"]
    return resp.json()["state"]["session_id"]


def join(client, session_id, name):
    return client.post("/api/session/join", json={"s": session_id, "name": name})


def resolved(client):
    return client.get("/api/state").json()["resolved"]


def test_storyteller_mode_is_the_default_and_has_no_names(client):
    story = client.post("/api/stories", json={"title": "T"}).json()
    story["scenes"] = SCENES
    client.put(f"/api/stories/{story['id']}", json=story)
    data = start(client, story["id"]).json()["state"]
    assert data["turn_mode"] == "storyteller"
    assert join(client, data["session_id"], "Wren").status_code == 409
    assert resolved(client)["decider"] is None


def test_taking_turns_follows_the_choices_and_rewinds_with_undo(client):
    sid = begin(client, "rotate")
    wren = join(client, sid, "  Wren ").json()
    join(client, sid, "Bea")
    assert wren["player"]["name"] == "Wren"
    assert join(client, sid, "wren").status_code == 409  # names are unique

    assert resolved(client)["decider"]["name"] == "Wren"
    client.post("/api/state/choice", json={"choice_index": 0})
    assert resolved(client)["decider"]["name"] == "Bea"
    client.post("/api/state/back")
    assert resolved(client)["decider"]["name"] == "Wren"


def test_the_turn_only_exists_during_a_scene(client):
    story = client.post("/api/stories", json={"title": "T"}).json()
    story["scenes"] = SCENES
    story["madlib_template"] = {"prompt": "{name}", "fields": [{"key": "name", "label": "Name?"}]}
    client.put(f"/api/stories/{story['id']}", json=story)
    resp = client.post("/api/state/start", json={"story_id": story["id"], "turn_mode": "rotate"})
    client.headers["X-Session-Token"] = resp.json()["token"]
    join(client, resp.json()["state"]["session_id"], "Wren")
    assert resolved(client)["decider"] is None  # character creation: nobody's turn yet
    client.post("/api/state/madlib", json={"answer": "Bea"})
    client.post("/api/state/proceed-from-character")
    assert resolved(client)["decider"]["name"] == "Wren"


def test_player_tokens_never_reach_clients(client):
    sid = begin(client, "rotate")
    join(client, sid, "Wren")
    players = client.get("/api/state").json()["state"]["players"]
    assert players == [{"id": players[0]["id"], "name": "Wren"}]


def test_a_phone_can_find_out_who_it_is(client):
    sid = begin(client, "rotate")
    token = join(client, sid, "Wren").json()["token"]
    assert client.get("/api/session/me", headers={"X-Player-Token": token}).json()["name"] == "Wren"
    assert client.get("/api/session/me", headers={"X-Player-Token": "nope"}).status_code == 403


def test_storyteller_picks_who_decides_and_only_they_can_propose(client):
    sid = begin(client, "pick")
    wren = join(client, sid, "Wren").json()
    bea = join(client, sid, "Bea").json()
    assert resolved(client)["decider"] is None

    client.post("/api/state/decider", json={"player_id": bea["player"]["id"]})
    assert resolved(client)["decider"]["name"] == "Bea"

    def propose(token, index):
        return client.post("/api/state/propose", json={"choice_index": index}, headers={"X-Player-Token": token})

    assert propose(bea["token"], 1).status_code == 409  # not dealt yet
    client.post("/api/state/reveal-choices")
    assert propose(wren["token"], 1).status_code == 403  # not Wren's turn
    assert propose(bea["token"], 1).status_code == 200
    assert client.get("/api/state").json()["state"]["proposal"] == 1

    client.post("/api/state/choice", json={"choice_index": 1})
    state = client.get("/api/state").json()["state"]
    assert state["proposal"] is None and state["decider_id"] is None  # fresh scene, pick again
    assert state["history"][-1]["decided_by"] == bea["player"]["id"]  # the stage marks Bea as having had a turn


def test_removing_a_player_moves_the_turn_on(client):
    sid = begin(client, "rotate")
    wren = join(client, sid, "Wren").json()
    join(client, sid, "Bea")
    client.delete(f"/api/state/players/{wren['player']['id']}")
    assert resolved(client)["decider"]["name"] == "Bea"


def test_storyteller_cannot_pick_outside_pick_mode(client):
    sid = begin(client, "rotate")
    bea = join(client, sid, "Bea").json()
    assert client.post("/api/state/decider", json={"player_id": bea["player"]["id"]}).status_code == 409
