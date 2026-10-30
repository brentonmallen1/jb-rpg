"""A story can give each item an icon; the icon travels with the item to the backpack and the keepsake."""

import copy

from .conftest import start
from .test_turns import SCENES


def test_an_items_icon_follows_it_from_the_story_to_the_backpack(client):
    scenes = copy.deepcopy(SCENES[:1])
    scenes[0]["choices"][1]["item_icon"] = "instrument"
    story = client.post("/api/stories", json={"title": "Icons"}).json()
    story["scenes"] = scenes
    client.put(f"/api/stories/{story['id']}", json=story)
    start(client, story["id"])

    client.post("/api/state/choice", json={"choice_index": 1})
    body = client.get("/api/state").json()
    assert body["state"]["history"][0]["item_icon"] == "instrument"
    assert body["resolved"]["items_found"] == [{"name": "i1-item", "icon": "instrument", "description": None, "scene_title": "S1"}]
    assert body["resolved"]["journey"][0]["item_icon"] == "instrument"  # one scene: the story is over


def test_an_icon_name_is_kept_short(client):
    story = client.post("/api/stories", json={"title": "Icons"}).json()
    scenes = copy.deepcopy(SCENES[:1])
    scenes[0]["choices"][1]["item_icon"] = "x" * 40
    story["scenes"] = scenes
    assert client.put(f"/api/stories/{story['id']}", json=story).status_code == 422


def test_an_items_description_reaches_the_backpack_with_the_heros_answers(client):
    scenes = copy.deepcopy(SCENES[:2])
    scenes[0]["choices"][1]["item_description"] = "Warm in {name}'s hand."
    story = client.post("/api/stories", json={"title": "Flavour"}).json()
    story["madlib_template"] = {"prompt": "{name} the brave.", "fields": [{"key": "name", "label": "Name?"}]}
    story["scenes"] = scenes
    client.put(f"/api/stories/{story['id']}", json=story)
    start(client, story["id"])
    client.post("/api/state/madlib", json={"answer": "Wren"})
    client.post("/api/state/proceed-from-character")

    client.post("/api/state/choice", json={"choice_index": 1})
    found = client.get("/api/state").json()["resolved"]["items_found"]
    assert found[0]["description"] == "Warm in Wren's hand."
