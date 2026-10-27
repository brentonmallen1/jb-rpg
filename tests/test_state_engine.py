import pytest


# Task 3.1: Variable Injection

def test_inject_variables_basic():
    from main import inject_variables
    fields = {"name": "Bob", "job": "wizard"}
    text = "{name} is a {job}."
    result = inject_variables(text, fields)
    assert result == "Bob is a wizard."

def test_inject_variables_missing_key():
    from main import inject_variables
    fields = {"name": "Bob"}
    text = "{name} has {unknown}."
    result = inject_variables(text, fields)
    assert result == "Bob has {unknown}."

def test_inject_variables_empty_fields():
    from main import inject_variables
    text = "{name} is here."
    result = inject_variables(text, {})
    assert result == "{name} is here."

def test_inject_variables_none_fields():
    from main import inject_variables
    text = "{name} is here."
    result = inject_variables(text, None)
    assert result == "{name} is here."


# Task 3.2: Condition Evaluation

def test_evaluate_condition_hp_lte():
    from main import evaluate_condition, Condition, ConditionType, GameState
    state = GameState(story_id="test", current_scene_id="s1", hp=1)
    cond = Condition(type=ConditionType.HP, op="lte", value=1)
    assert evaluate_condition(cond, state) is True
    state.hp = 2
    assert evaluate_condition(cond, state) is False

def test_evaluate_condition_hp_gte():
    from main import evaluate_condition, Condition, ConditionType, GameState
    state = GameState(story_id="test", current_scene_id="s1", hp=3)
    cond = Condition(type=ConditionType.HP, op="gte", value=2)
    assert evaluate_condition(cond, state) is True

def test_evaluate_condition_items_count():
    from main import evaluate_condition, Condition, ConditionType, GameState
    state = GameState(story_id="test", current_scene_id="s1", hp=3, items=["sword", "shield"])
    cond = Condition(type=ConditionType.ITEMS, op="gte", value=2)
    assert evaluate_condition(cond, state) is True
    cond = Condition(type=ConditionType.ITEMS, op="gte", value=3)
    assert evaluate_condition(cond, state) is False

def test_evaluate_condition_level():
    from main import evaluate_condition, Condition, ConditionType, GameState
    state = GameState(story_id="test", current_scene_id="s1", hp=3, level=2)
    cond = Condition(type=ConditionType.LEVEL, op="eq", value=2)
    assert evaluate_condition(cond, state) is True

def test_evaluate_condition_scene_outcome():
    from main import evaluate_condition, Condition, ConditionType, GameState, HistoryEntry, ChoiceKind
    state = GameState(
        story_id="test", current_scene_id="s2", hp=3,
        history=[HistoryEntry(scene_id="s1", outcome=ChoiceKind.ITEM, choice_index=1, item_name="key")]
    )
    cond = Condition(type=ConditionType.SCENE_OUTCOME, scene_id="s1", outcome="item")
    assert evaluate_condition(cond, state) is True
    cond = Condition(type=ConditionType.SCENE_OUTCOME, scene_id="s1", outcome="damage")
    assert evaluate_condition(cond, state) is False

def test_evaluate_condition_scene_not_played():
    from main import evaluate_condition, Condition, ConditionType, GameState
    state = GameState(story_id="test", current_scene_id="s1", hp=3)
    cond = Condition(type=ConditionType.SCENE_OUTCOME, scene_id="s1", outcome="item")
    assert evaluate_condition(cond, state) is False


# Task 3.3: Resolve Scene Text

def test_resolve_scene_text():
    from main import (resolve_scene_text, Scene, Choice, ChoiceKind, ConditionalText,
                      Condition, ConditionType, GameState, Character)
    scene = Scene(
        id="s1", title="Test", base_text="{name} enters the room.",
        choices=[Choice(kind=ChoiceKind.DAMAGE, display_text="Fight", result_text="Fight happens", amount=1)],
        conditional_text=[
            ConditionalText(condition=Condition(type=ConditionType.HP, op="lte", value=1), text="You look injured.")
        ]
    )
    state = GameState(
        story_id="test", current_scene_id="s1", hp=1,
        character=Character(name="Bob", description="Bob desc", fields={"name": "Bob"})
    )
    result = resolve_scene_text(scene, state)
    assert result == "Bob enters the room. You look injured."

def test_resolve_scene_text_no_conditions_match():
    from main import (resolve_scene_text, Scene, Choice, ChoiceKind, ConditionalText,
                      Condition, ConditionType, GameState)
    scene = Scene(
        id="s1", title="Test", base_text="You enter.",
        choices=[Choice(kind=ChoiceKind.DAMAGE, display_text="Fight", result_text="Fight happens", amount=1)],
        conditional_text=[
            ConditionalText(condition=Condition(type=ConditionType.HP, op="lte", value=1), text="You look injured.")
        ]
    )
    state = GameState(story_id="test", current_scene_id="s1", hp=3)
    result = resolve_scene_text(scene, state)
    assert result == "You enter."


# Task 3.4: Replay History

def test_replay_history():
    from main import replay_history, HistoryEntry, ChoiceKind
    history = [
        HistoryEntry(scene_id="s1", outcome=ChoiceKind.DAMAGE, choice_index=0, damage_amount=1),
        HistoryEntry(scene_id="s2", outcome=ChoiceKind.ITEM, choice_index=1, item_name="sword"),
        HistoryEntry(scene_id="s3", outcome=ChoiceKind.LEVEL, choice_index=2),
    ]
    hp, level, items = replay_history(history, starting_hp=3)
    assert hp == 2
    assert level == 2
    assert items == ["sword"]

def test_replay_history_empty():
    from main import replay_history
    hp, level, items = replay_history([], starting_hp=3)
    assert hp == 3
    assert level == 1
    assert items == []

def test_replay_history_multiple_items():
    from main import replay_history, HistoryEntry, ChoiceKind
    history = [
        HistoryEntry(scene_id="s1", outcome=ChoiceKind.ITEM, choice_index=1, item_name="sword"),
        HistoryEntry(scene_id="s2", outcome=ChoiceKind.ITEM, choice_index=1, item_name="shield"),
    ]
    hp, level, items = replay_history(history, starting_hp=3)
    assert items == ["sword", "shield"]
