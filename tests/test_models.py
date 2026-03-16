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
