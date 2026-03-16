import pytest
from fastapi.testclient import TestClient
import json


@pytest.fixture
def client(tmp_path, monkeypatch):
    import main
    monkeypatch.setattr(main, "STORIES_DIR", tmp_path / "stories")
    monkeypatch.setattr(main, "STATE_FILE", tmp_path / "state.json")
    main.STORIES_DIR.mkdir(exist_ok=True)
    return TestClient(main.app)


def make_story(client, *, with_madlibs=True, scenes=None, starting_hp=3, theme="fantasy"):
    """Helper: create a story and return its id."""
    resp = client.post("/api/stories", json={"title": "Test Story"})
    story = resp.json()
    story_id = story["id"]

    if scenes is None:
        scenes = [
            {
                "id": "s1",
                "title": "Scene 1",
                "base_text": "You are in a forest.",
                "choices": [{"kind": "damage", "text": "Fight", "amount": 1}],
                "conditional_text": [],
            },
            {
                "id": "s2",
                "title": "Scene 2",
                "base_text": "You find a cave.",
                "choices": [{"kind": "item", "text": "Take sword", "amount": 1, "item_name": "sword"}],
                "conditional_text": [],
            },
        ]

    story["scenes"] = scenes
    story["settings"]["starting_hp"] = starting_hp
    story["theme"] = theme
    if with_madlibs:
        story["madlib_template"] = {
            "prompt": "Tell us about {name}",
            "fields": [
                {"key": "name", "label": "Your name"},
                {"key": "class", "label": "Your class"},
            ],
        }
    else:
        story["madlib_template"] = {"prompt": "", "fields": []}

    client.put(f"/api/stories/{story_id}", json=story)
    return story_id


# Task 4.1: Get State Endpoint

def test_get_state_no_session(client):
    response = client.get("/api/state")
    assert response.status_code == 200
    assert response.json() == {"state": None, "resolved": None}


def test_get_state_with_session(client):
    story_id = make_story(client, with_madlibs=False)
    client.post("/api/state/start", json={"story_id": story_id})
    response = client.get("/api/state")
    assert response.status_code == 200
    data = response.json()
    assert data["state"] is not None
    assert data["resolved"] is not None
    assert data["state"]["story_id"] == story_id


# Task 4.2: Start Session Endpoint

def test_start_session(client):
    story_id = make_story(client)
    response = client.post("/api/state/start", json={"story_id": story_id})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "madlib_in_progress"
    assert data["story_id"] == story_id
    assert data["current_scene_id"] == "s1"
    assert data["hp"] == 3
    assert data["madlib_step"] == 0


def test_start_session_no_madlibs(client):
    story_id = make_story(client, with_madlibs=False)
    response = client.post("/api/state/start", json={"story_id": story_id})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"
    assert data["character"] is None


def test_start_session_story_not_found(client):
    response = client.post("/api/state/start", json={"story_id": "nonexistent"})
    assert response.status_code == 404


# Task 4.3: Mad Libs Endpoint

def test_madlib_submit(client):
    story_id = make_story(client)
    client.post("/api/state/start", json={"story_id": story_id})

    # Submit first field
    resp1 = client.post("/api/state/madlib", json={"answer": "Alice"})
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["status"] == "madlib_in_progress"
    assert data1["madlib_step"] == 1
    assert data1["madlib_answers"]["name"] == "Alice"

    # Submit second (last) field — should transition to running
    resp2 = client.post("/api/state/madlib", json={"answer": "wizard"})
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["status"] == "running"
    assert data2["character"] is not None
    assert data2["character"]["fields"]["name"] == "Alice"
    assert data2["character"]["fields"]["class"] == "wizard"


def test_madlib_wrong_status(client):
    story_id = make_story(client, with_madlibs=False)
    client.post("/api/state/start", json={"story_id": story_id})

    response = client.post("/api/state/madlib", json={"answer": "Alice"})
    assert response.status_code == 409


# Task 4.4: Choice Endpoint

def test_choice_damage(client):
    story_id = make_story(client, with_madlibs=False)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["hp"] == 2
    assert data["current_scene_id"] == "s2"
    assert len(data["history"]) == 1
    assert data["history"][0]["scene_id"] == "s1"
    assert data["history"][0]["outcome"] == "damage"


def test_choice_item(client):
    scenes = [
        {
            "id": "s1",
            "title": "Scene 1",
            "base_text": "You find something.",
            "choices": [{"kind": "item", "text": "Take sword", "amount": 1, "item_name": "sword"}],
            "conditional_text": [],
        },
        {
            "id": "s2",
            "title": "Scene 2",
            "base_text": "Next scene.",
            "choices": [{"kind": "damage", "text": "Fight", "amount": 1}],
            "conditional_text": [],
        },
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 200
    data = resp.json()
    assert "sword" in data["items"]
    assert data["history"][0]["outcome"] == "item"
    assert data["history"][0]["item_name"] == "sword"


def test_choice_level(client):
    scenes = [
        {
            "id": "s1",
            "title": "Scene 1",
            "base_text": "You level up.",
            "choices": [{"kind": "level", "text": "Level up", "amount": 1}],
            "conditional_text": [],
        },
        {
            "id": "s2",
            "title": "Scene 2",
            "base_text": "Next scene.",
            "choices": [{"kind": "damage", "text": "Fight", "amount": 1}],
            "conditional_text": [],
        },
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["level"] == 2
    assert data["history"][0]["outcome"] == "level"


def test_choice_hp_zero_defeat(client):
    story_id = make_story(client, with_madlibs=False, starting_hp=1)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "game_over"
    assert data["outcome"] == "defeat"
    assert data["hp"] == 0


def test_choice_last_scene_game_over(client):
    scenes = [
        {
            "id": "s1",
            "title": "Last Scene",
            "base_text": "The finale.",
            "choices": [{"kind": "level", "text": "Win", "amount": 1}],
            "conditional_text": [],
        }
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "game_over"
    assert data["outcome"] is None  # awaiting dice roll


def test_choice_game_over_409(client):
    scenes = [
        {
            "id": "s1",
            "title": "Only Scene",
            "base_text": "Fight!",
            "choices": [{"kind": "level", "text": "End", "amount": 1}],
            "conditional_text": [],
        }
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})
    client.post("/api/state/choice", json={"choice_index": 0})  # -> game_over

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 409


# Task 4.5: Back Button Endpoint

def test_back_button(client):
    story_id = make_story(client, with_madlibs=False)
    client.post("/api/state/start", json={"story_id": story_id})

    # Make a choice (damage, hp goes 3->2)
    client.post("/api/state/choice", json={"choice_index": 0})

    # Go back
    resp = client.post("/api/state/back")
    assert resp.status_code == 200
    data = resp.json()
    assert data["current_scene_id"] == "s1"
    assert data["hp"] == 3
    assert data["history"] == []


def test_back_from_game_over(client):
    scenes = [
        {
            "id": "s1",
            "title": "Scene 1",
            "base_text": "Fight!",
            "choices": [{"kind": "level", "text": "End", "amount": 1}],
            "conditional_text": [],
        }
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})
    client.post("/api/state/choice", json={"choice_index": 0})  # -> game_over

    resp = client.post("/api/state/back")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "running"
    assert data["current_scene_id"] == "s1"


def test_back_empty_history_noop(client):
    story_id = make_story(client, with_madlibs=False)
    client.post("/api/state/start", json={"story_id": story_id})

    state_before = client.get("/api/state").json()["state"]
    resp = client.post("/api/state/back")
    assert resp.status_code == 200
    state_after = resp.json()
    assert state_after["current_scene_id"] == state_before["current_scene_id"]
    assert state_after["hp"] == state_before["hp"]


def test_back_madlib_noop(client):
    story_id = make_story(client)  # with madlibs
    client.post("/api/state/start", json={"story_id": story_id})

    state_before = client.get("/api/state").json()["state"]
    resp = client.post("/api/state/back")
    assert resp.status_code == 200
    state_after = resp.json()
    assert state_after["status"] == "madlib_in_progress"
    assert state_after["madlib_step"] == state_before["madlib_step"]


# Task 4.6: Finish and Restart Endpoints

def test_finish_victory(client):
    scenes = [
        {
            "id": "s1",
            "title": "Finale",
            "base_text": "The end.",
            "choices": [{"kind": "level", "text": "Win", "amount": 1}],
            "conditional_text": [],
        }
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})
    client.post("/api/state/choice", json={"choice_index": 0})  # -> game_over, outcome=None

    resp = client.post("/api/state/finish", json={"outcome": "victory"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "game_over"
    assert data["outcome"] == "victory"


def test_finish_defeat(client):
    scenes = [
        {
            "id": "s1",
            "title": "Finale",
            "base_text": "The end.",
            "choices": [{"kind": "level", "text": "End", "amount": 1}],
            "conditional_text": [],
        }
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})
    client.post("/api/state/choice", json={"choice_index": 0})

    resp = client.post("/api/state/finish", json={"outcome": "defeat"})
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "defeat"


def test_finish_wrong_status(client):
    story_id = make_story(client, with_madlibs=False)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/finish", json={"outcome": "victory"})
    assert resp.status_code == 409


def test_restart(client):
    story_id = make_story(client, with_madlibs=False)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/restart")
    assert resp.status_code == 200

    state_resp = client.get("/api/state")
    assert state_resp.json() == {"state": None, "resolved": None}


def test_choice_item_without_name_422(client):
    """Item choice with empty item_name should return 422."""
    scenes = [
        {
            "id": "s1",
            "title": "Scene 1",
            "base_text": "Find something.",
            "choices": [{"kind": "item", "text": "Take thing", "amount": 1, "item_name": ""}],
            "conditional_text": [],
        }
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 422
    assert "item_name" in resp.json()["detail"].lower()


def test_choice_item_null_name_422(client):
    """Item choice with null item_name should return 422."""
    scenes = [
        {
            "id": "s1",
            "title": "Scene 1",
            "base_text": "Find something.",
            "choices": [{"kind": "item", "text": "Take thing", "amount": 1, "item_name": None}],
            "conditional_text": [],
        }
    ]
    story_id = make_story(client, with_madlibs=False, scenes=scenes)
    client.post("/api/state/start", json={"story_id": story_id})

    resp = client.post("/api/state/choice", json={"choice_index": 0})
    assert resp.status_code == 422
