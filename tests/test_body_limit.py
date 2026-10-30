"""The server refuses a story (or any other request) over MAX_STORY_MB before parsing it; audio has its own limit."""

from app import config


def too_big_story(story_id):
    return {"id": story_id, "title": "Big", "madlib_template": {"prompt": "x" * 2_000_000, "fields": []}, "scenes": []}


def test_a_story_over_the_limit_is_refused(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_STORY_MB", 1)
    created = client.post("/api/stories", json={"title": "Big"}).json()

    resp = client.put(f"/api/stories/{created['id']}", json=too_big_story(created["id"]))
    assert resp.status_code == 413
    assert "1 MB" in resp.json()["detail"]
    assert client.post("/api/stories/import", json=too_big_story("big")).status_code == 413
    assert client.get(f"/api/stories/{created['id']}").json()["madlib_template"]["prompt"] == ""


def test_a_body_that_doesnt_say_how_big_it_is_is_counted(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_STORY_MB", 1)
    created = client.post("/api/stories", json={"title": "Big"}).json()

    def chunks():
        yield b'{"id": "' + created["id"].encode() + b'", "title": "Big", "scenes": [], "madlib_template": {"fields": [], "prompt": "'
        for _ in range(20):
            yield b"x" * 100_000
        yield b'"}}'

    resp = client.put(f"/api/stories/{created['id']}", content=chunks(), headers={"Content-Type": "application/json"})
    assert resp.status_code == 413


def test_a_story_under_the_limit_saves(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_STORY_MB", 3)
    created = client.post("/api/stories", json={"title": "Big"}).json()
    assert client.put(f"/api/stories/{created['id']}", json=too_big_story(created["id"])).status_code == 200


def test_audio_keeps_its_own_limit(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_STORY_MB", 1)
    created = client.post("/api/stories", json={"title": "Loud"}).json()
    resp = client.put(f"/api/stories/{created['id']}/audio/rain.mp3", content=b"\xff\xfb" + b"\0" * 2_000_000)
    assert resp.status_code == 200
    assert resp.json()["size"] == 2_000_002
