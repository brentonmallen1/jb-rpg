"""Game rules as pure functions over GameState.

Nothing here touches files, HTTP or SSE. Each transition validates that it's legal
for the current status, mutates the state in place, and raises GameError otherwise.
The session's story is the snapshot in `state.story`, taken when the game started.
"""

import random
import re
import secrets
import zlib
from typing import Literal

from .models import (
    Character,
    ChoiceKind,
    Condition,
    ConditionType,
    GameState,
    HistoryEntry,
    Scene,
    SessionStatus,
    Story,
)


class GameError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# ---------------------------------------------------------------------------
# Text
# ---------------------------------------------------------------------------


def inject_variables(
    text: str,
    fields: dict[str, str] | None,
    state: GameState | None = None,
    item_texts: dict[str, dict[str, str]] | None = None,
    outcome: Literal["victory", "defeat"] | None = None,
) -> str:
    """Replace {key} placeholders with mad lib answers, and {item_text:Name} with item blocks."""

    def replace(match):
        key = match.group(1)

        if key.startswith("item_text:"):
            item_name = key[len("item_text:"):]
            if state and item_name in state.items and item_texts and item_name in item_texts:
                item_entry = item_texts[item_name]
                if outcome and outcome in item_entry:
                    return item_entry[outcome]
                # Fall back to whichever outcome text exists
                return item_entry.get("victory", item_entry.get("defeat", ""))
            return ""  # item not collected: drop the placeholder

        if fields:
            return fields.get(key, match.group(0))
        return match.group(0)

    # Word chars, spaces, colons, hyphens and apostrophes (item names)
    return re.sub(r"\{([\w\s:'\-]+)\}", replace, text)


def evaluate_condition(condition: Condition, state: GameState) -> bool:
    if condition.type == ConditionType.SCENE_OUTCOME:
        for entry in state.history:
            if entry.scene_id == condition.scene_id:
                return entry.outcome.value == condition.outcome
        return False

    if condition.type == ConditionType.HP:
        actual = state.hp
    elif condition.type == ConditionType.ITEMS:
        actual = len(state.items)
    elif condition.type == ConditionType.LEVEL:
        actual = state.level
    else:
        return False

    if not condition.op or condition.value is None:
        return False
    if condition.op == "lte":
        return actual <= condition.value
    if condition.op == "gte":
        return actual >= condition.value
    if condition.op == "eq":
        return actual == condition.value
    return False


def resolve_scene_text(scene: Scene, state: GameState) -> str:
    """Scene text with matching conditional text appended and variables injected."""
    fields = state.character.fields if state.character else None
    text = inject_variables(scene.base_text, fields)
    for ct in scene.conditional_text:
        if evaluate_condition(ct.condition, state):
            text += " " + inject_variables(ct.text, fields)
    return text


def build_resolved(state: GameState | None) -> dict | None:
    """Server-side content for clients. This is everything players ever see of the story."""
    if state is None or state.story is None:
        return None
    story = state.story
    fields = state.character.fields if state.character else None
    char_desc = state.character.description if state.character else None
    base = {
        "character_description": char_desc,
        "story_title": story.title,
        "theme": story.theme.value,
        "visible_choices": [],
        "max_hp": story.settings.starting_hp,
        # Players never see progress; this is how they learn the end has arrived
        "finale": state.status == SessionStatus.GAME_OVER and state.outcome is None,
    }

    if state.status == SessionStatus.MADLIB_IN_PROGRESS:
        # Players see the question being asked, never the template it fills
        questions = story.madlib_template.fields
        if state.madlib_step < len(questions):
            base["madlib_question"] = questions[state.madlib_step].label
            base["madlib_progress"] = {"step": state.madlib_step + 1, "total": len(questions)}

    if state.status == SessionStatus.OPENING_SCENE_ACTIVE and story.opening_scene:
        text = inject_variables(story.opening_scene.base_text, fields)
        for ct in story.opening_scene.conditional_text:
            if evaluate_condition(ct.condition, state):
                text += " " + inject_variables(ct.text, fields)
        return {**base, "scene_text": text, "scene_title": story.opening_scene.title}

    scene = get_scene(story, state.current_scene_id)
    if scene is None:
        return None
    resolved = {
        **base,
        "scene_text": resolve_scene_text(scene, state),
        "scene_title": scene.title,
        "scene_subtitle": scene.display_name,
        # Clients map these onto their theme's moods; the seed makes "auto" stable per scene
        "mood": scene.mood,
        "mood_seed": zlib.crc32(scene.id.encode()),
    }
    if scene.is_finale and state.status == SessionStatus.RUNNING:
        resolved["finale"] = True

    # Player-facing choice text in shuffled order, once revealed. Outcomes never leave the server.
    if state.choices_revealed:
        resolved["visible_choices"] = [
            inject_variables(scene.choices[i].display_text, fields)
            for i in state.shuffled_indices
            if 0 <= i < len(scene.choices)
        ]
    if scene.victory_text:
        resolved["victory_text"] = inject_variables(scene.victory_text, fields, state, scene.item_texts, "victory")
    if scene.defeat_text:
        resolved["defeat_text"] = inject_variables(scene.defeat_text, fields, state, scene.item_texts, "defeat")
    return resolved


# ---------------------------------------------------------------------------
# Story checks
# ---------------------------------------------------------------------------


def get_scene(story: Story, scene_id: str) -> Scene | None:
    return next((s for s in story.scenes if s.id == scene_id), None)


def story_problems(story: Story) -> list[str]:
    """Everything that would break a game of this story. Empty means ready to play.

    Saving never enforces these (the editor autosaves half-finished work); starting a game does.
    """
    problems = []
    if not story.scenes:
        problems.append("The story has no scenes.")

    scene_ids = [s.id for s in story.scenes]
    seen = set()
    for sid in scene_ids:
        if sid in seen:
            problems.append(f"Scene id '{sid}' is used more than once.")
        seen.add(sid)

    keys = [f.key for f in story.madlib_template.fields]
    if any(not k.strip() for k in keys):
        problems.append("A character creation question has no key.")
    if len(set(keys)) != len(keys):
        problems.append("Two character creation questions share the same key.")

    def check_conditions(where: str, conditional_text):
        for ct in conditional_text:
            c = ct.condition
            if c.type == ConditionType.SCENE_OUTCOME:
                if not c.scene_id or not c.outcome:
                    problems.append(f"{where}: a scene-outcome condition needs a scene and an outcome.")
                elif c.scene_id not in seen:
                    problems.append(f"{where}: a condition refers to a scene that doesn't exist ('{c.scene_id}').")
            elif not c.op or c.value is None:
                problems.append(f"{where}: a {c.type.value} condition needs a comparison and a number.")

    for scene in story.scenes:
        where = f"Scene '{scene.title or scene.id}'"
        if not scene.is_finale and not scene.choices:
            problems.append(f"{where} has no choices. Add some, or mark it as the finale.")
        for choice in scene.choices:
            if choice.kind == ChoiceKind.ITEM and not (choice.item_name or "").strip():
                problems.append(f"{where}: an item choice has no item name.")
        check_conditions(where, scene.conditional_text)

    if story.opening_scene:
        for choice in story.opening_scene.choices:
            if choice.target_scene_id and choice.target_scene_id not in seen:
                problems.append(f"Opening scene: a choice leads to a scene that doesn't exist ('{choice.target_scene_id}').")
        check_conditions("Opening scene", story.opening_scene.conditional_text)

    return problems


# ---------------------------------------------------------------------------
# Transitions
# ---------------------------------------------------------------------------


def require_status(state: GameState, *allowed: SessionStatus) -> None:
    if state.status not in allowed:
        expected = " or ".join(s.value for s in allowed)
        raise GameError(409, f"Not allowed in status {state.status.value} (needs {expected})")


def new_session(story: Story) -> GameState:
    problems = story_problems(story)
    if problems:
        raise GameError(422, "This story isn't ready to play: " + " ".join(problems))

    if story.madlib_template.fields:
        status = SessionStatus.MADLIB_IN_PROGRESS
    elif story.opening_scene:
        status = SessionStatus.OPENING_SCENE_ACTIVE
    else:
        status = SessionStatus.RUNNING

    return GameState(
        session_id=secrets.token_urlsafe(16),
        story_id=story.id,
        status=status,
        current_scene_id=story.scenes[0].id,
        hp=story.settings.starting_hp,
        story=story,
    )


def replay_history(history: list[HistoryEntry], starting_hp: int) -> tuple[int, int, list[str]]:
    """Recalculate hp, level and items from history alone."""
    hp, level, items = starting_hp, 1, []
    for entry in history:
        if entry.outcome == ChoiceKind.DAMAGE:
            hp -= entry.damage_amount
        elif entry.outcome == ChoiceKind.ITEM:
            if entry.item_name:
                items.append(entry.item_name)
        elif entry.outcome == ChoiceKind.LEVEL:
            level += 1
    return hp, level, items


def _restore_from_history(state: GameState) -> None:
    state.hp, state.level, state.items = replay_history(state.history, state.story.settings.starting_hp)


def _enter_scene(state: GameState, scene_id: str) -> None:
    """Every scene change starts with that scene's choices hidden and unshuffled."""
    state.current_scene_id = scene_id
    state.choices_revealed = False
    state.shuffled_indices = []


def submit_madlib(state: GameState, answer: str) -> None:
    require_status(state, SessionStatus.MADLIB_IN_PROGRESS)
    template = state.story.madlib_template
    field = template.fields[state.madlib_step]
    state.madlib_answers[field.key] = answer
    state.madlib_step += 1

    if state.madlib_step >= len(template.fields):
        fields = dict(state.madlib_answers)
        state.character = Character(
            # The "name" answer names the character; otherwise the first answer does
            name=fields.get("name", next(iter(fields.values()), "Adventurer")),
            description=inject_variables(template.prompt, fields),
            fields=fields,
        )
        state.status = SessionStatus.CHARACTER_REVEAL


def madlib_back(state: GameState) -> None:
    require_status(state, SessionStatus.MADLIB_IN_PROGRESS)
    if state.madlib_step <= 0:
        raise GameError(409, "Already at first field")
    state.madlib_step -= 1


def proceed_from_character(state: GameState) -> None:
    require_status(state, SessionStatus.CHARACTER_REVEAL)
    if state.story.opening_scene:
        state.status = SessionStatus.OPENING_SCENE_ACTIVE
    else:
        state.status = SessionStatus.RUNNING


def opening_choice(state: GameState, choice_index: int | None) -> None:
    require_status(state, SessionStatus.OPENING_SCENE_ACTIVE)
    story = state.story
    if not story.opening_scene:
        raise GameError(409, "Story has no opening scene")

    if choice_index is not None:
        if not 0 <= choice_index < len(story.opening_scene.choices):
            raise GameError(422, "Invalid choice index")
        target = story.opening_scene.choices[choice_index].target_scene_id
        if target:
            if get_scene(story, target) is None:
                raise GameError(422, "Invalid target scene")
            _enter_scene(state, target)
            state.status = SessionStatus.RUNNING
        else:
            state.status = SessionStatus.AWAITING_SCENE_SELECTION
    elif story.settings.non_linear:
        state.status = SessionStatus.AWAITING_SCENE_SELECTION
    else:
        _enter_scene(state, story.scenes[0].id)
        state.status = SessionStatus.RUNNING


def reveal_choices(state: GameState, show_to_players: bool) -> None:
    """Shuffle the current scene's choices (once), optionally pushing them to players."""
    require_status(state, SessionStatus.RUNNING)
    scene = get_scene(state.story, state.current_scene_id)
    if scene is None:
        raise GameError(404, "Scene not found")
    if not state.shuffled_indices:
        indices = list(range(len(scene.choices)))
        random.shuffle(indices)
        state.shuffled_indices = indices
    if show_to_players:
        state.choices_revealed = True


def make_choice(state: GameState, visual_index: int) -> None:
    require_status(state, SessionStatus.RUNNING)
    story = state.story
    scene = get_scene(story, state.current_scene_id)
    if scene is None:
        raise GameError(422, "Current scene not found")
    if not 0 <= visual_index < len(scene.choices):
        raise GameError(422, "Invalid choice index")

    # Map the on-screen position back to the story's choice (history stores the original)
    original_index = visual_index
    if state.shuffled_indices:
        if len(state.shuffled_indices) != len(scene.choices):
            raise GameError(409, "Choice order is out of date; reveal the choices again")
        original_index = state.shuffled_indices[visual_index]
    choice = scene.choices[original_index]

    if choice.kind == ChoiceKind.ITEM and not choice.item_name:
        raise GameError(422, "Item choice must have item_name")

    if choice.kind == ChoiceKind.DAMAGE:
        state.hp -= choice.amount
    elif choice.kind == ChoiceKind.ITEM:
        state.items.append(choice.item_name)
    elif choice.kind == ChoiceKind.LEVEL:
        state.level += 1

    state.history.append(HistoryEntry(
        scene_id=state.current_scene_id,
        outcome=choice.kind,
        choice_index=original_index,
        item_name=choice.item_name if choice.kind == ChoiceKind.ITEM else None,
        damage_amount=choice.amount,
    ))

    if state.hp <= 0:
        state.hp = 0
        state.status = SessionStatus.GAME_OVER
        state.outcome = "defeat"
        state.outcome_revealed = True
    else:
        played = {h.scene_id for h in state.history}
        scene_ids = [s.id for s in story.scenes]
        if all(sid in played for sid in scene_ids):
            state.status = SessionStatus.GAME_OVER
            state.outcome = None  # awaiting the physical dice roll
        elif story.settings.non_linear:
            state.status = SessionStatus.AWAITING_SCENE_SELECTION
        else:
            current = scene_ids.index(state.current_scene_id)
            if current == len(scene_ids) - 1:
                state.status = SessionStatus.GAME_OVER
                state.outcome = None  # awaiting the physical dice roll
            else:
                _enter_scene(state, scene_ids[current + 1])
                return
    state.choices_revealed = False
    state.shuffled_indices = []


def go_back(state: GameState) -> None:
    """Undo the last choice. A no-op before any choice has been made."""
    if state.status == SessionStatus.MADLIB_IN_PROGRESS or not state.history:
        return
    popped = state.history.pop()
    _restore_from_history(state)
    _enter_scene(state, popped.scene_id)
    state.status = SessionStatus.RUNNING
    state.outcome = None
    state.outcome_revealed = False


def select_scene(state: GameState, scene_id: str, revisit: bool) -> None:
    """Non-linear stories: the storyteller picks the next scene."""
    require_status(state, SessionStatus.AWAITING_SCENE_SELECTION)
    story = state.story
    scene = get_scene(story, scene_id)
    if scene is None:
        raise GameError(400, f"Scene not found: {scene_id}")

    played = {h.scene_id for h in state.history}
    if scene.is_finale and any(not s.is_finale and s.id not in played for s in story.scenes):
        raise GameError(400, "Complete all scenes before accessing the finale")

    if scene_id in played:
        if not revisit:
            raise GameError(400, f"Scene already played: {scene_id}")
        # Revisit: forget that scene's outcome and recalculate
        state.history = [h for h in state.history if h.scene_id != scene_id]
        _restore_from_history(state)

    _enter_scene(state, scene_id)
    state.status = SessionStatus.RUNNING


def finish(state: GameState, outcome: Literal["victory", "defeat"]) -> None:
    """Record the result of the physical d20 roll."""
    if state.status == SessionStatus.RUNNING:
        scene = get_scene(state.story, state.current_scene_id)
        if not scene or not scene.is_finale:
            raise GameError(409, "Can only finish from finale scene or game_over status")
        state.status = SessionStatus.GAME_OVER
    elif state.status != SessionStatus.GAME_OVER:
        raise GameError(409, f"Cannot finish in status: {state.status.value}")
    state.outcome = outcome
    state.outcome_revealed = True


def reveal_outcome(state: GameState) -> None:
    require_status(state, SessionStatus.GAME_OVER)
    if state.outcome is None:
        raise GameError(409, "Outcome not set yet")
    state.outcome_revealed = True
