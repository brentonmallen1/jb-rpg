"""Non-linear stories take turns too: the player whose turn it is points at the next door."""

import copy

from .test_turns import SCENES, join, resolved


def begin_doors(client, mode):
    story = client.post("/api/stories", json={"title": "Doors"}).json()
    story["scenes"] = copy.deepcopy(SCENES[:3])
    story["scenes"][2]["is_finale"] = True
    story["settings"] = {**story.get("settings", {}), "non_linear": True}
    client.put(f"/api/stories/{story['id']}", json=story)
    resp = client.post("/api/state/start", json={"story_id": story["id"], "turn_mode": mode})
    client.headers["X-Session-Token"] = resp.json()["token"]
    return resp.json()["state"]["session_id"]


def propose(client, token, scene_id):
    return client.post("/api/state/propose-door", json={"scene_id": scene_id}, headers={"X-Player-Token": token})


def test_taking_turns_the_decider_points_at_a_door(client):
    sid = begin_doors(client, "rotate")
    wren = join(client, sid, "Wren").json()["token"]
    bea = join(client, sid, "Bea").json()["token"]
    client.post("/api/state/choice", json={"choice_index": 0})  # the first room opens by itself (Wren's turn)
    assert client.get("/api/state").json()["state"]["status"] == "awaiting_scene_selection"

    phone = client.get("/api/state", params={"s": sid}, headers={"X-Session-Token": ""}).json()["resolved"]
    assert phone["doors"] is None  # not dealt yet
    assert propose(client, bea, "s2").status_code == 409
    client.post("/api/state/deal-doors")
    phone = client.get("/api/state", params={"s": sid}, headers={"X-Session-Token": ""}).json()["resolved"]
    assert [(d["id"], d["played"], d["sealed"], d["open"]) for d in phone["doors"]] == [
        ("s1", True, False, False), ("s2", False, False, True), ("s3", False, True, False)]  # the last door stays sealed
    assert resolved(client)["decider"]["name"] == "Bea"

    assert propose(client, wren, "s2").status_code == 403  # not Wren's turn
    assert propose(client, bea, "s3").status_code == 422  # sealed
    assert propose(client, bea, "s1").status_code == 422  # already opened
    assert propose(client, bea, "s2").status_code == 200
    assert client.get("/api/state").json()["state"]["door_proposal"] == "s2"

    client.post("/api/state/select-scene", json={"scene_id": "s2"})
    state = client.get("/api/state").json()
    assert state["state"]["door_proposal"] is None and state["resolved"]["doors"] is None
    assert state["resolved"]["decider"]["name"] == "Bea"  # the one who chose the door plays it

    client.post("/api/state/choice", json={"choice_index": 0})
    assert resolved(client)["decider"]["name"] == "Wren"
    assert [d["id"] for d in resolved(client)["doors"] if d["open"]] == ["s3"]  # now the last door opens
    assert client.get("/api/state").json()["state"]["doors_dealt"] is False  # a new choice of door, dealt again


def test_the_picked_player_chooses_the_door_and_plays_the_room(client):
    sid = begin_doors(client, "pick")
    wren = join(client, sid, "Wren").json()
    client.post("/api/state/choice", json={"choice_index": 0})
    assert resolved(client)["decider"] is None
    client.post("/api/state/decider", json={"player_id": wren["player"]["id"]})
    assert resolved(client)["decider"]["name"] == "Wren"
    client.post("/api/state/deal-doors")
    assert propose(client, wren["token"], "s2").status_code == 200
    client.post("/api/state/select-scene", json={"scene_id": "s2"})
    assert resolved(client)["decider"]["name"] == "Wren"
