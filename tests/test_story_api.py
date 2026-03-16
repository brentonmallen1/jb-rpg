import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import json


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Create test client with isolated stories directory."""
    import main
    monkeypatch.setattr(main, "STORIES_DIR", tmp_path / "stories")
    monkeypatch.setattr(main, "STATE_FILE", tmp_path / "state.json")
    main.STORIES_DIR.mkdir(exist_ok=True)
    return TestClient(main.app)


# Task 2.1: List Stories
def test_list_stories_empty(client):
    response = client.get("/api/stories")
    assert response.status_code == 200
    assert response.json() == []


# Task 2.2: Create Story
def test_create_story(client):
    response = client.post("/api/stories", json={"title": "My Adventure"})
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "My Adventure"
    assert data["theme"] == "cyberpunk"
    assert data["settings"]["starting_hp"] == 3
    assert data["scenes"] == []
    assert data["madlib_template"]["fields"] == []
    assert "id" in data


def test_create_story_appears_in_list(client):
    client.post("/api/stories", json={"title": "Test Story"})
    response = client.get("/api/stories")
    assert len(response.json()) == 1
    assert response.json()[0]["title"] == "Test Story"


# Task 2.3: Get Single Story
def test_get_story(client):
    create_resp = client.post("/api/stories", json={"title": "Get Test"})
    story_id = create_resp.json()["id"]
    response = client.get(f"/api/stories/{story_id}")
    assert response.status_code == 200
    assert response.json()["title"] == "Get Test"


def test_get_story_not_found(client):
    response = client.get("/api/stories/nonexistent")
    assert response.status_code == 404


# Task 2.4: Update Story
def test_update_story(client):
    create_resp = client.post("/api/stories", json={"title": "Original"})
    story = create_resp.json()
    story["title"] = "Updated"
    story["theme"] = "fantasy"

    response = client.put(f"/api/stories/{story['id']}", json=story)
    assert response.status_code == 200
    assert response.json()["title"] == "Updated"
    assert response.json()["theme"] == "fantasy"

    # Verify persisted
    get_resp = client.get(f"/api/stories/{story['id']}")
    assert get_resp.json()["title"] == "Updated"


# Task 2.5: Delete Story
def test_delete_story(client):
    create_resp = client.post("/api/stories", json={"title": "To Delete"})
    story_id = create_resp.json()["id"]

    response = client.delete(f"/api/stories/{story_id}")
    assert response.status_code == 200

    # Verify gone
    get_resp = client.get(f"/api/stories/{story_id}")
    assert get_resp.status_code == 404


def test_delete_story_clears_active_session(client, tmp_path):
    import main
    create_resp = client.post("/api/stories", json={"title": "Active"})
    story_id = create_resp.json()["id"]

    # Create a state file for this story
    state = {"story_id": story_id, "status": "running"}
    with open(main.STATE_FILE, "w") as f:
        json.dump(state, f)

    client.delete(f"/api/stories/{story_id}")

    # State file should be cleared
    assert not main.STATE_FILE.exists() or main.STATE_FILE.read_text() == "{}"
