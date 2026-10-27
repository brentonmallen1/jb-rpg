import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Test client with isolated data and fresh in-memory server state."""
    from app import config, sse, storage
    from app.main import app

    monkeypatch.setattr(storage, "STORIES_DIR", tmp_path / "stories")
    monkeypatch.setattr(storage, "STATE_FILE", tmp_path / "state.json")
    # Exercise the real access rules regardless of the developer's .env
    monkeypatch.setattr(config, "AUTH_DISABLED", False)
    monkeypatch.setattr(config, "ADMIN_USER", "")
    monkeypatch.setattr(config, "ADMIN_PASSWORD", "")
    sse.connections.clear()
    storage.STORIES_DIR.mkdir(exist_ok=True)
    return TestClient(app)


def start(client, story_id, force=False):
    """Start a session and act as the storyteller for the rest of the test."""
    resp = client.post("/api/state/start", json={"story_id": story_id, "force": force})
    if resp.status_code == 200:
        client.headers["X-Session-Token"] = resp.json()["token"]
    return resp
