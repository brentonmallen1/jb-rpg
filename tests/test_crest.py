"""The table picks the hero's crest as the hero is revealed; screens draw it from the answers."""

import hashlib

from app import emblems
from app.models import Emblem

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


SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><path d="M0 0h240v240z"/></svg>'


class FakeService:
    """Stands in for the emblem service: three emblems per input, or down."""

    def __init__(self, monkeypatch, up=True):
        self.calls = []
        self.up = up

        async def fetch(theme, input, count):
            self.calls.append((theme, input, count))
            if not self.up:
                raise emblems.EmblemsUnavailable("down")
            return [Emblem(theme=theme, input=input if i == 0 else f"{input}#{i}", version=1, description=f"emblem {i}", svg=SVG) for i in range(count)]

        monkeypatch.setattr(emblems, "_fetch", fetch)


def test_emblems_come_from_the_service_in_the_storys_theme(client, monkeypatch):
    service = FakeService(monkeypatch)
    start(client, story_with_hero(client))
    assert client.get("/api/state/emblems").status_code == 409  # no hero yet
    client.post("/api/state/madlib", json={"answer": "Wren"})

    options = client.get("/api/state/emblems").json()["emblems"]
    assert len(options) == 3 and service.calls[-1][0] == "insignia"  # cyberpunk's crew tags
    state = client.get("/api/state").json()["state"]
    background = hashlib.sha256(state["character"]["description"].encode()).hexdigest()[:16]
    assert service.calls[-1][1] == background  # a hash of the background, not the words

    again = client.get("/api/state/emblems", params={"round": 1}).json()["emblems"]
    assert again[0]["input"] != options[0]["input"]

    chosen = client.post("/api/state/crest", json={"emblem": options[1]["input"]}).json()
    assert chosen["emblem"]["input"] == options[1]["input"] and chosen["emblem"]["svg"] == SVG
    assert client.post("/api/state/crest", json={"variant": 2}).json()["emblem"] is None  # a built-in crest replaces it


def test_the_built_in_crests_stand_in_when_the_service_is_down(client, monkeypatch):
    FakeService(monkeypatch, up=False)
    start(client, story_with_hero(client))
    client.post("/api/state/madlib", json={"answer": "Wren"})
    assert client.get("/api/state/emblems").status_code == 503
    assert client.post("/api/state/crest", json={"emblem": "x:Wren"}).status_code == 503
    assert client.post("/api/state/crest", json={"variant": 1}).json()["crest"] == 1
