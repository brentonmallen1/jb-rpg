from .conftest import start


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


def test_delete_story_clears_active_session(client):
    from app import storage
    story = client.post("/api/stories", json={"title": "Active"}).json()
    story["scenes"] = [{
        "id": "s1", "title": "S1", "base_text": "Hi.",
        "choices": [{"kind": "level", "display_text": "Go", "result_text": "Gone"}],
    }]
    client.put(f"/api/stories/{story['id']}", json=story)
    start(client, story["id"])
    assert storage.load_state() is not None

    assert client.delete(f"/api/stories/{story['id']}").status_code == 200
    assert storage.load_state() is None
    assert client.get("/api/session/check").json()["active"] is False


def test_create_story_empty_title_422(client):
    """Empty title should return 422."""
    response = client.post("/api/stories", json={"title": ""})
    assert response.status_code == 422


def test_create_story_whitespace_title_422(client):
    """Whitespace-only title should return 422."""
    response = client.post("/api/stories", json={"title": "   "})
    assert response.status_code == 422


def test_create_story_title_trimmed(client):
    """Title with leading/trailing whitespace should be trimmed."""
    response = client.post("/api/stories", json={"title": "  My Story  "})
    assert response.status_code == 200
    assert response.json()["title"] == "My Story"


def test_import_story_keeps_id_or_picks_a_new_one(client):
    exported = client.post("/api/stories", json={"title": "Original"}).json()

    copy = client.post("/api/stories/import", json=exported).json()
    assert copy["id"] != exported["id"]  # id taken: imported as a new story
    assert copy["title"] == "Original"

    fresh = dict(exported, id="brand-new")
    assert client.post("/api/stories/import", json=fresh).json()["id"] == "brand-new"

    unsafe = dict(exported, id="../etc/passwd")
    assert client.post("/api/stories/import", json=unsafe).json()["id"] != "../etc/passwd"
    assert len(client.get("/api/stories").json()) == 4


def test_import_rejects_non_stories(client):
    assert client.post("/api/stories/import", json={"title": "no scenes or template"}).status_code == 422


def test_duplicate_story_copies_content_and_assets(client):
    from app import storage
    original = client.post("/api/stories", json={"title": "Original"}).json()
    asset = storage.assets_dir(original["id"]) / "rain.mp3"
    asset.parent.mkdir(parents=True)
    asset.write_bytes(b"fake audio")

    copy = client.post(f"/api/stories/{original['id']}/duplicate").json()
    assert copy["id"] != original["id"]
    assert copy["title"] == "Original (copy)"
    assert (storage.assets_dir(copy["id"]) / "rain.mp3").read_bytes() == b"fake audio"

    # Deleting a story removes its assets too
    client.delete(f"/api/stories/{copy['id']}")
    assert not storage.assets_dir(copy["id"]).exists()
    assert asset.exists()
