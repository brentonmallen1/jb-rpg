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
    c = Choice(kind=ChoiceKind.DAMAGE, text="Take the risk", amount=1)
    assert c.kind == ChoiceKind.DAMAGE
    assert c.amount == 1
    assert c.item_name is None


def test_choice_item():
    from main import Choice, ChoiceKind
    c = Choice(kind=ChoiceKind.ITEM, text="Search", item_name="Compass", amount=1)
    assert c.item_name == "Compass"


def test_scene():
    from main import Scene, Choice, ChoiceKind
    s = Scene(
        id="scene_1",
        title="The Start",
        base_text="You enter.",
        choices=[
            Choice(kind=ChoiceKind.DAMAGE, text="Fight", amount=1),
            Choice(kind=ChoiceKind.ITEM, text="Search", item_name="Key", amount=1),
            Choice(kind=ChoiceKind.LEVEL, text="Study", amount=1),
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
