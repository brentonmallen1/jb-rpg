"""The table picks the hero's crest as the hero is revealed; screens draw it from the answers."""

from .conftest import start
from .test_turns import SCENES


def story_with_hero(client):
    story = client.post("/api/stories", json={"title": "Crest"}).json()
    story["madlib_template"] = {"prompt": "{name} the brave.", "fields": [{"key": "name", "label": "Name?"}]}
    story["scenes"] = SCENES
    client.put(f"/api/stories/{story['id']}", json=story)
    return story["id"]


def test_the_crest_is_chosen_while_the_hero_is_revealed(client):
    start(client, story_with_hero(client))
    assert client.post("/api/state/crest", json={"variant": 4}).status_code == 409  # no hero yet

    client.post("/api/state/madlib", json={"answer": "Wren"})
    assert client.post("/api/state/crest", json={"variant": 4}).json()["crest"] == 4
    assert client.post("/api/state/crest", json={"variant": -1}).status_code == 422

    client.post("/api/state/proceed-from-character")
    assert client.post("/api/state/crest", json={"variant": 2}).status_code == 409  # sealed once the story begins
    assert client.get("/api/state").json()["state"]["crest"] == 4
