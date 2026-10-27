import pytest


def test_theme_name_values():
    from main import ThemeName
    assert ThemeName.CYBERPUNK.value == "cyberpunk"
    assert ThemeName.FANTASY.value == "fantasy"
    assert ThemeName.DEEP_SPACE.value == "deep_space"
    assert ThemeName.MODERN.value == "modern"
    assert ThemeName.HORROR.value == "horror"


def test_session_status_values():
    from main import SessionStatus
    assert SessionStatus.MADLIB_IN_PROGRESS.value == "madlib_in_progress"
    assert SessionStatus.RUNNING.value == "running"
    assert SessionStatus.GAME_OVER.value == "game_over"


def test_choice_kind_values():
    from main import ChoiceKind
    assert ChoiceKind.DAMAGE.value == "damage"
    assert ChoiceKind.ITEM.value == "item"
    assert ChoiceKind.LEVEL.value == "level"


def test_condition_type_values():
    from main import ConditionType
    assert ConditionType.HP.value == "hp"
    assert ConditionType.ITEMS.value == "items"
    assert ConditionType.LEVEL.value == "level"
    assert ConditionType.SCENE_OUTCOME.value == "scene_outcome"


def test_condition_hp():
    from main import Condition, ConditionType
    c = Condition(type=ConditionType.HP, op="lte", value=1)
    assert c.type == ConditionType.HP
    assert c.op == "lte"
    assert c.value == 1


def test_condition_scene_outcome():
    from main import Condition, ConditionType
    c = Condition(type=ConditionType.SCENE_OUTCOME, scene_id="scene_1", outcome="damage")
    assert c.scene_id == "scene_1"
    assert c.outcome == "damage"


def test_choice_damage():
    from main import Choice, ChoiceKind
    c = Choice(kind=ChoiceKind.DAMAGE, display_text="Take the risk", result_text="Take the risk happens", amount=1)
    assert c.kind == ChoiceKind.DAMAGE
    assert c.amount == 1
    assert c.item_name is None


def test_choice_item():
    from main import Choice, ChoiceKind
    c = Choice(kind=ChoiceKind.ITEM, display_text="Search", result_text="Search happens", item_name="Compass", amount=1)
    assert c.item_name == "Compass"


def test_scene():
    from main import Scene, Choice, ChoiceKind
    s = Scene(
        id="scene_1",
        title="The Start",
        base_text="You enter.",
        choices=[
            Choice(kind=ChoiceKind.DAMAGE, display_text="Fight", result_text="Fight happens", amount=1),
            Choice(kind=ChoiceKind.ITEM, display_text="Search", result_text="Search happens", item_name="Key", amount=1),
            Choice(kind=ChoiceKind.LEVEL, display_text="Study", result_text="Study happens", amount=1),
        ]
    )
    assert s.id == "scene_1"
    assert len(s.choices) == 3
    assert s.conditional_text == []


def test_madlib_template():
    from main import MadLibTemplate, MadLibField
    t = MadLibTemplate(
        prompt="{name} is a {job}",
        fields=[
            MadLibField(key="name", label="Enter a name"),
            MadLibField(key="job", label="Enter a job"),
        ]
    )
    assert len(t.fields) == 2
    assert t.fields[0].key == "name"


def test_history_entry():
    from main import HistoryEntry, ChoiceKind
    h = HistoryEntry(
        scene_id="scene_1",
        outcome=ChoiceKind.DAMAGE,
        choice_index=0,
        damage_amount=1
    )
    assert h.scene_id == "scene_1"
    assert h.outcome == ChoiceKind.DAMAGE
    assert h.item_name is None


def test_character():
    from main import Character
    c = Character(
        name="Bob",
        description="Bob is a wizard.",
        fields={"name": "Bob", "class": "wizard"}
    )
    assert c.name == "Bob"
    assert c.fields["class"] == "wizard"


def test_game_state_defaults():
    from main import GameState, SessionStatus
    g = GameState(
        story_id="test",
        current_scene_id="scene_1",
        hp=3
    )
    assert g.status == SessionStatus.MADLIB_IN_PROGRESS
    assert g.level == 1
    assert g.items == []
    assert g.history == []
    assert g.character is None
    assert g.outcome is None
