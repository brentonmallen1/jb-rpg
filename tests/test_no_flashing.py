"""A table-wide switch for calm effects: set when the game starts, changeable at any time."""

from .test_turns import SCENES


def story_id(client):
    story = client.post("/api/stories", json={"title": "Calm"}).json()
    story["scenes"] = SCENES
    client.put(f"/api/stories/{story['id']}", json=story)
    return story["id"]


def test_off_unless_asked_for(client):
    resp = client.post("/api/state/start", json={"story_id": story_id(client)})
    assert resp.json()["state"]["no_flashing"] is False


def test_chosen_at_start_and_seen_by_phones(client):
    resp = client.post("/api/state/start", json={"story_id": story_id(client), "no_flashing": True})
    sid = resp.json()["state"]["session_id"]
    phone = client.get(f"/api/state?s={sid}").json()
    assert phone["state"]["no_flashing"] is True


def test_only_the_storyteller_can_change_it(client):
    resp = client.post("/api/state/start", json={"story_id": story_id(client)})
    assert client.post("/api/state/no-flashing", json={"no_flashing": True}).status_code == 403
    client.headers["X-Session-Token"] = resp.json()["token"]
    assert client.post("/api/state/no-flashing", json={"no_flashing": True}).json()["no_flashing"] is True
    client.post("/api/state/no-flashing", json={"no_flashing": False})
    assert client.get("/api/state").json()["state"]["no_flashing"] is False
