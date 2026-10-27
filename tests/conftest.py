import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Test client with isolated data and fresh in-memory server state."""
    import main
    monkeypatch.setattr(main, "STORIES_DIR", tmp_path / "stories")
    monkeypatch.setattr(main, "STATE_FILE", tmp_path / "state.json")
    monkeypatch.setattr(main, "_session_token", None)
    # Exercise the real access rules regardless of the developer's .env
    monkeypatch.setattr(main, "AUTH_DISABLED", False)
    monkeypatch.setattr(main, "ADMIN_USER", "")
    monkeypatch.setattr(main, "ADMIN_PASSWORD", "")
    main._rate_limit_store.clear()
    main.sse_connections.clear()
    main.storyteller_connections.clear()
    main.player_connections.clear()
    main.STORIES_DIR.mkdir(exist_ok=True)
    return TestClient(main.app)


def start(client, story_id):
    """Start a session and act as the storyteller for the rest of the test."""
    resp = client.post("/api/state/start", json={"story_id": story_id})
    if resp.status_code == 200:
        client.headers["X-Session-Token"] = resp.json()["token"]
    return resp
