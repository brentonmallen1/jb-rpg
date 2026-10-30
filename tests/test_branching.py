"""Branching stories: choices and routes that lead somewhere, locked doors, and the item catalogue."""

import json
from pathlib import Path

import pytest

from app import engine
from app.engine import GameError
from app.models import SessionStatus, Story


def choice(kind="level", to=None, item=None, text="Go"):
    c = {"kind": kind, "display_text": text, "result_text": "It happens."}
    if to:
        c["next_scene_id"] = to
    if item:
        c["item_id"] = item
    return c


def scene(sid, *choices, **extra):
    return {"id": sid, "title": sid.title(), "base_text": f"In {sid}.", "choices": list(choices) or [choice()], **extra}


def finale(sid):
    return {"id": sid, "title": sid.title(), "base_text": "The end nears.", "choices": [], "is_finale": True}


def held(item_id):
    return {"type": "item_held", "item_id": item_id}


ROPE = {"id": "rope", "name": "Climbing Rope", "description": "Good knots."}


def story(*scenes, items=(ROPE,), non_linear=False, **extra):
    return Story.model_validate({
        "id": "t", "title": "T", "madlib_template": {"prompt": "", "fields": []},
        "scenes": list(scenes), "items": list(items), "settings": {"non_linear": non_linear}, **extra,
    })


def play(s: Story):
    return engine.new_session(s)


def choose(state, original_index):
    """Make the choice at this index in the story (no shuffle)."""
    engine.make_choice(state, original_index)


# ---------------------------------------------------------------------------
# Where a choice leads
# ---------------------------------------------------------------------------


def test_a_choice_can_lead_anywhere():
    state = play(story(scene("a", choice(), choice(to="c")), scene("b"), scene("c")))
    choose(state, 1)
    assert state.current_scene_id == "c"


def test_without_a_path_the_story_goes_down_the_list():
    state = play(story(scene("a", choice(), choice(to="c")), scene("b"), scene("c")))
    choose(state, 0)
    assert state.current_scene_id == "b"


def test_routes_are_checked_in_order_and_the_choice_wins_over_them():
    s = story(
        scene("a", choice("item", item="rope"), choice(to="d"),
              routes=[{"condition": held("rope"), "target": "c"}, {"condition": {"type": "level", "op": "gte", "value": 1}, "target": "b"}]),
        scene("b"), scene("c"), scene("d"),
    )
    state = play(s)
    choose(state, 0)  # the rope is found by this very choice, so the first route takes it
    assert state.current_scene_id == "c"

    state = play(s)
    choose(state, 1)
    assert state.current_scene_id == "d"


def test_after_this_scene_and_the_end():
    s = story(scene("a", choice(), next="c"), scene("b", choice(to="end")), scene("c", next="end"), scene("d"))
    state = play(s)
    choose(state, 0)
    assert state.current_scene_id == "c"
    choose(state, 0)
    assert state.status == SessionStatus.GAME_OVER and state.outcome is None  # on to the d20

    state = play(s)
    state.current_scene_id = "b"
    choose(state, 0)
    assert state.status == SessionStatus.GAME_OVER


def test_a_branch_can_end_at_its_own_finale():
    s = story(scene("a", choice(to="lost"), choice(to="win")), finale("win"), finale("lost"))
    state = play(s)
    choose(state, 0)
    assert state.current_scene_id == "lost" and state.status == SessionStatus.RUNNING
    assert engine.awaiting_roll(state)


def test_back_across_a_branch_returns_to_where_the_table_was():
    s = story(scene("a", choice("item", item="rope", to="c"), choice()), scene("b"), scene("c"))
    state = play(s)
    choose(state, 0)
    assert state.current_scene_id == "c" and state.items == ["Climbing Rope"]
    engine.go_back(state)
    assert state.current_scene_id == "a" and state.items == []
    choose(state, 1)
    assert state.current_scene_id == "b"


# ---------------------------------------------------------------------------
# Items: one catalogue, checked from anywhere
# ---------------------------------------------------------------------------


def test_an_item_is_held_for_the_rest_of_the_game_and_back_takes_it_away():
    s = story(
        scene("a", choice("item", item="rope")),
        scene("b"), scene("c"), scene("d"),
        scene("e", conditional_text=[{"condition": held("rope"), "text": "The rope is still on your back."}]),
    )
    state = play(s)
    choose(state, 0)
    for _ in range(3):
        choose(state, 0)
    assert state.current_scene_id == "e"
    assert "still on your back" in engine.build_resolved(state)["scene_text"]
    state.current_scene_id = "e"
    while state.history:
        engine.go_back(state)
    assert not engine.holds_item(state, "rope")


def test_history_keeps_the_item_as_it_was_found():
    state = play(story(scene("a", choice("item", item="rope")), scene("b")))
    choose(state, 0)
    entry = state.history[0]
    assert (entry.item_id, entry.item_name, entry.item_description) == ("rope", "Climbing Rope", "Good knots.")
    assert engine.build_resolved(state)["items_found"][0]["description"] == "Good knots."


def test_older_stories_move_their_items_into_the_catalogue():
    s = Story.model_validate({
        "id": "old", "title": "Old", "madlib_template": {"prompt": "", "fields": []},
        "scenes": [
            {"id": "a", "title": "A", "base_text": "", "choices": [
                {"kind": "item", "display_text": "x", "result_text": "y", "item_name": "Elder's Map", "item_icon": "writing"},
                {"kind": "level", "display_text": "x", "result_text": "y", "item_name": "stray"},
            ]},
            {"id": "b", "title": "B", "base_text": "", "choices": [
                {"kind": "item", "display_text": "x", "result_text": "y", "item_name": "Elder's Map", "item_description": "Crossed out."},
            ]},
            {"id": "z", "title": "Z", "base_text": "", "is_finale": True, "victory_text": "{item_text:Elder's Map}",
             "item_texts": {"Elder's Map": {"victory": "The map was right."}}},
        ],
    })
    assert [(i.id, i.name, i.icon, i.description) for i in s.items] == [("item_elders_map", "Elder's Map", "writing", "Crossed out.")]
    assert s.scenes[0].choices[0].item_id == s.scenes[1].choices[0].item_id == "item_elders_map"
    assert s.scenes[0].choices[1].item_id is None  # only item choices give items
    assert all(c.item_name is None for sc in s.scenes for c in sc.choices)
    assert list(s.scenes[2].item_texts) == ["item_elders_map"]
    assert Story.model_validate(s.model_dump(mode="json")) == s  # loading twice changes nothing

    state = play(s)
    choose(state, 0)
    state.current_scene_id = "z"
    assert engine.build_resolved(state)["victory_text"] == "The map was right."


@pytest.mark.parametrize("path", sorted(Path("data/stories").glob("demo-*.json")))
def test_demo_stories_still_load_cleanly(path):
    s = Story.model_validate(json.loads(path.read_text()))
    assert engine.story_problems(s) == []
    assert all(c.item_id for sc in s.scenes for c in sc.choices if c.kind.value == "item")


# ---------------------------------------------------------------------------
# Door stories: locks, rooms behind doors, the last door
# ---------------------------------------------------------------------------


def doors(state):
    return {d["id"]: d for d in engine.open_doors(state)}


def test_a_locked_door_opens_once_the_item_is_found():
    s = story(
        scene("hall", choice("item", item="rope")),
        scene("pit", requires=[held("rope")]),
        scene("well"),
        finale("end_room"),
        non_linear=True,
    )
    state = play(s)
    state.status = SessionStatus.AWAITING_SCENE_SELECTION
    d = doors(state)
    assert d["pit"]["locked"] and not d["pit"]["open"]
    with pytest.raises(GameError, match="locked"):
        engine.select_scene(state, "pit", revisit=False)

    engine.select_scene(state, "hall", revisit=False)
    choose(state, 0)
    assert doors(state)["pit"]["open"]


def test_the_last_door_opens_when_no_other_door_can():
    s = story(scene("hall"), scene("pit", requires=[held("rope")]), finale("end_room"), non_linear=True)
    state = play(s)
    state.status = SessionStatus.AWAITING_SCENE_SELECTION
    assert doors(state)["end_room"]["sealed"]
    engine.select_scene(state, "hall", revisit=False)
    choose(state, 0)
    # the pit stays locked (nothing gives the rope), so the finale opens rather than leaving the table stuck
    assert doors(state)["end_room"]["open"]


def test_a_room_behind_a_door_is_not_a_door():
    s = story(scene("hall", choice(to="cellar")), scene("cellar"), scene("attic"), finale("end_room"), non_linear=True)
    assert [x.id for x in engine.door_scenes(s)] == ["hall", "attic", "end_room"]
    state = play(s)
    state.status = SessionStatus.AWAITING_SCENE_SELECTION
    engine.select_scene(state, "hall", revisit=False)
    choose(state, 0)
    assert state.current_scene_id == "cellar" and state.status == SessionStatus.RUNNING
    choose(state, 0)
    assert state.status == SessionStatus.AWAITING_SCENE_SELECTION  # back to the doors
    with pytest.raises(GameError, match="isn't a door"):
        engine.select_scene(state, "cellar", revisit=True)


def test_a_door_story_without_a_finale_ends_when_no_door_is_left():
    state = play(story(scene("hall"), scene("attic"), non_linear=True))
    choose(state, 0)
    assert state.status == SessionStatus.AWAITING_SCENE_SELECTION
    engine.select_scene(state, "attic", revisit=False)
    choose(state, 0)
    assert state.status == SessionStatus.GAME_OVER


# ---------------------------------------------------------------------------
# Problems
# ---------------------------------------------------------------------------


def problems(s: Story):
    return {(p["severity"], p["scene_id"], p["field"], p["index"]): p["message"] for p in engine.story_problems(s)}


def test_links_to_nowhere_and_to_themselves():
    found = problems(story(
        scene("a", choice(to="ghost"), choice(to="a"), routes=[{"condition": held("rope"), "target": ""}], next="gone"),
        scene("b"),
    ))
    assert "doesn't exist ('ghost')" in found[("error", "a", "next_scene_id", 0)]
    assert "same scene" in found[("error", "a", "next_scene_id", 1)]
    assert "nowhere to go" in found[("error", "a", "routes", 0)]
    assert "doesn't exist ('gone')" in found[("error", "a", "next", None)]


def test_a_loop_is_a_problem():
    found = problems(story(scene("a"), scene("b", choice(to="c")), scene("c", next="b")))
    assert "B → C → B" in found[("error", "b", "next", None)]
    with pytest.raises(GameError, match="loop"):
        play(story(scene("a"), scene("b", choice(to="c")), scene("c", next="b")))


def test_a_scene_nothing_leads_to_is_a_warning_and_doesnt_stop_play():
    s = story(scene("a", choice(to="c")), scene("b"), scene("c", next="end"))
    found = problems(s)
    assert found == {("warning", "b", None, None): "Scene 'B': no path leads here."}
    play(s)


def test_item_problems():
    found = problems(story(
        scene("a", choice("item"), choice("item", item="ghost"), routes=[{"condition": {"type": "item_held"}, "target": "b"}]),
        scene("b", requires=[held("lamp")], conditional_text=[{"condition": held("oil"), "text": "t"}]),
        items=[ROPE, {"id": "oil", "name": "Lantern Oil"}, {"id": "oil2", "name": "lantern oil"}],
    ))
    assert "has no item" in found[("error", "a", "item_id", 0)]
    assert "no longer exists" in found[("error", "a", "item_id", 1)]
    assert "needs the item" in found[("error", "a", "routes", 0)]
    assert "a lock depends on an item that no longer exists" in found[("error", "b", "requires", 0)]
    assert "both called" in found[("error", None, "name", 2)]
    assert found[("warning", None, "id", 1)] == "Scene 'B' checks for 'Lantern Oil', but no choice gives it."


# ---------------------------------------------------------------------------
# How far there is to go (storyteller only)
# ---------------------------------------------------------------------------


def test_scenes_to_go_counts_the_shortest_and_longest_paths():
    s = story(
        scene("a", choice(to="b"), choice(to="d")),
        scene("b"), scene("c", next="end"), scene("d", next="end"),
    )
    assert engine.scenes_to_go(s, "a") == (2, 3)
    assert engine.scenes_to_go(s, "c") == (1, 1)
    assert engine.scenes_to_go(story(scene("a"), non_linear=True), "a") is None


def test_only_the_storyteller_learns_how_far_is_left(client):
    created = client.post("/api/stories", json={"title": "Paths"}).json()
    body = story(scene("a", choice(to="b"), choice(to="c")), scene("b", next="end"), scene("c"), finale("z")).model_dump(mode="json")
    client.put(f"/api/stories/{created['id']}", json={**body, "id": created["id"]})
    resp = client.post("/api/state/start", json={"story_id": created["id"]})
    client.headers["X-Session-Token"] = resp.json()["token"]
    sid = resp.json()["state"]["session_id"]

    assert client.get("/api/state").json()["path_progress"] == {"played": 0, "to_go": [2, 3]}
    phone = client.get("/api/state", params={"s": sid}, headers={"X-Session-Token": ""}).json()
    assert "path_progress" not in phone
