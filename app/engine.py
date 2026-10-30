"""Game rules as pure functions over GameState.

Nothing here touches files, HTTP or SSE. Each transition validates that it's legal
for the current status, mutates the state in place, and raises GameError otherwise.
The session's story is the snapshot in `state.story`, taken when the game started.
"""

import random
import re
import secrets
import time
import zlib
from typing import Literal

from .models import (
    Character,
    ChoiceKind,
    Condition,
    ConditionType,
    Emblem,
    GameState,
    HistoryEntry,
    Player,
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


def build_resolved(state: GameState | None, now: float | None = None) -> dict | None:
    """Server-side content for clients. This is everything players ever see of the story."""
    if state is None or state.story is None:
        return None
    now = time.time() if now is None else now
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
        # (until the outcome is revealed: a roll can decide it before the storyteller tells it)
        "finale": state.status == SessionStatus.GAME_OVER and not state.outcome_revealed,
        # Only during a scene: the turn begins when the scene does
        "decider": _player_ref(current_decider(state)) if state.status == SessionStatus.RUNNING else None,
        "vote": vote_status(state, now),
        # The backpack: each item with the scene it was found in (scenes the table has already played)
        "items_found": [
            {
                "name": entry.item_name,
                "icon": entry.item_icon,
                "description": inject_variables(entry.item_description, fields) if entry.item_description else None,
                "scene_title": _scene_title(story, entry.scene_id),
            }
            for entry in state.history
            if entry.item_name
        ],
    }

    if state.final_rolls or awaiting_roll(state):
        base["final_roll"] = {
            "rolls": state.final_rolls,
            "bonus": len(state.items),
            "attempts": state.level,
            "target": ROLL_TARGET,
            "offered": state.roll_offered,
        }

    if state.status == SessionStatus.GAME_OVER:
        # The keepsake: the path the table took, once the story is over
        base["journey"] = [
            {"scene_title": _scene_title(story, entry.scene_id), "outcome": entry.outcome.value, "item_name": entry.item_name, "item_icon": entry.item_icon}
            for entry in state.history
        ]

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


def _scene_title(story: Story, scene_id: str) -> str:
    scene = get_scene(story, scene_id)
    if scene is not None:
        return scene.title
    return story.opening_scene.title if story.opening_scene else ""


def for_players(resolved: dict | None, state: GameState | None) -> dict | None:
    """What phones get: a scene's words arrive with its choices (revealed on the stage or dealt),
    once the storyteller has told it."""
    told = state is not None and (state.choices_revealed or bool(state.shuffled_indices))
    if not resolved or state is None or state.status != SessionStatus.RUNNING or told:
        return resolved
    scene = get_scene(state.story, state.current_scene_id) if state.story else None
    if scene is None or not scene.choices or not resolved.get("scene_text"):
        return resolved
    return {**resolved, "scene_text": None, "scene_text_pending": True}


# ---------------------------------------------------------------------------
# Story checks
# ---------------------------------------------------------------------------


def get_scene(story: Story, scene_id: str) -> Scene | None:
    return next((s for s in story.scenes if s.id == scene_id), None)


def story_problems(story: Story) -> list[dict]:
    """Everything that would break a game of this story. Empty means ready to play.

    Each problem says where it is, so the editor can point at it:
    {"message", "area": story|characters|opening|scene, "scene_id", "field", "index"}.
    Saving never enforces these (the editor autosaves half-finished work); starting a game does.
    """
    problems: list[dict] = []

    def add(message: str, area: str, scene_id: str | None = None, field: str | None = None, index: int | None = None):
        problems.append({"message": message, "area": area, "scene_id": scene_id, "field": field, "index": index})

    if not story.scenes:
        add("The story has no scenes.", "story")

    seen = set()
    for scene in story.scenes:
        if scene.id in seen:
            add(f"Scene id '{scene.id}' is used more than once.", "scene", scene.id)
        seen.add(scene.id)

    keys = [f.key for f in story.madlib_template.fields]
    if any(not k.strip() for k in keys):
        add("A character creation question has no key.", "characters")
    if len(set(keys)) != len(keys):
        add("Two character creation questions share the same key.", "characters")

    def check_conditions(where: str, area: str, scene_id: str | None, conditional_text):
        for i, ct in enumerate(conditional_text):
            c = ct.condition
            if c.type == ConditionType.SCENE_OUTCOME:
                if not c.scene_id or not c.outcome:
                    add(f"{where}: a line that depends on an earlier scene needs the scene and how it went.", area, scene_id, "conditional_text", i)
                elif c.scene_id not in seen:
                    add(f"{where}: a line depends on a scene that no longer exists ('{c.scene_id}').", area, scene_id, "conditional_text", i)
            elif not c.op or c.value is None:
                stat = {"hp": "health", "items": "number of items", "level": "level"}[c.type.value]
                add(f"{where}: a line that depends on the hero's {stat} needs a comparison and a number.", area, scene_id, "conditional_text", i)

    for scene in story.scenes:
        where = f"Scene '{scene.title or scene.id}'"
        if not scene.is_finale and not scene.choices:
            add(f"{where} has no choices. Add some, or mark it as the finale.", "scene", scene.id, "choices")
        for i, choice in enumerate(scene.choices):
            if choice.kind == ChoiceKind.ITEM and not (choice.item_name or "").strip():
                add(f"{where}: an item choice has no item name.", "scene", scene.id, "item_name", i)
        check_conditions(where, "scene", scene.id, scene.conditional_text)

    if story.opening_scene:
        for i, choice in enumerate(story.opening_scene.choices):
            if choice.target_scene_id and choice.target_scene_id not in seen:
                add(f"Opening scene: a choice leads to a scene that doesn't exist ('{choice.target_scene_id}').", "opening", None, "target_scene_id", i)
        check_conditions("Opening scene", "opening", None, story.opening_scene.conditional_text)

    return problems


# ---------------------------------------------------------------------------
# Transitions
# ---------------------------------------------------------------------------


def require_status(state: GameState, *allowed: SessionStatus) -> None:
    if state.status not in allowed:
        expected = " or ".join(s.value for s in allowed)
        raise GameError(409, f"Not allowed in status {state.status.value} (needs {expected})")


def new_session(story: Story, turn_mode: str = "storyteller", no_flashing: bool = False) -> GameState:
    problems = story_problems(story)
    if problems:
        raise GameError(422, "This story isn't ready to play: " + " ".join(p["message"] for p in problems))

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
        turn_mode=turn_mode,
        no_flashing=no_flashing,
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
    """Every scene change starts with that scene's choices hidden and unshuffled, and no decider picked."""
    state.current_scene_id = scene_id
    state.roll_offered = False
    state.final_rolls = []
    state.choices_revealed = False
    state.shuffled_indices = []
    state.decider_id = None
    state.proposal = None
    _clear_vote(state)


# ---------------------------------------------------------------------------
# Turns: who makes each choice
# ---------------------------------------------------------------------------

MAX_PLAYERS = 12


def _player_ref(player: Player | None) -> dict | None:
    return {"id": player.id, "name": player.name} if player else None


def _clear_vote(state: GameState) -> None:
    state.vote_eligible = []
    state.vote_deadline = None
    state.votes = {}


def voting_open(state: GameState, now: float) -> bool:
    return (
        state.turn_mode == "vote"
        and state.status == SessionStatus.RUNNING
        and bool(state.vote_eligible)
        and len(state.votes) < len(state.vote_eligible)
        and (state.vote_deadline is None or now < state.vote_deadline)
    )


def vote_status(state: GameState, now: float) -> dict | None:
    """What everyone may know about the vote: counts and time, never who voted for what."""
    if state.turn_mode != "vote" or not state.vote_eligible or state.status != SessionStatus.RUNNING:
        return None
    return {
        "open": voting_open(state, now),
        "eligible": state.vote_eligible,
        "voted": sorted(state.votes),
        "ends_in": None if state.vote_deadline is None else max(0.0, state.vote_deadline - now),
    }


def vote_tally(state: GameState) -> dict | None:
    """Storyteller only: votes per choice (visual index) and the leader(s); several leaders = a tie."""
    if not state.vote_eligible:
        return None
    counts: dict[int, int] = {}
    for index in state.votes.values():
        counts[index] = counts.get(index, 0) + 1
    top = max(counts.values(), default=0)
    return {"counts": counts, "leaders": sorted(i for i, c in counts.items() if c == top and top > 0)}


def cast_vote(state: GameState, player: Player, visual_index: int, now: float) -> None:
    if state.turn_mode != "vote":
        raise GameError(409, "This game doesn't vote")
    if player.id not in state.vote_eligible:
        raise GameError(403, "You joined after this vote began. You can vote in the next scene.")
    # A player can change their vote until the vote closes (time's up, or every vote is in)
    if not voting_open(state, now):
        raise GameError(409, "Voting has closed")
    if not 0 <= visual_index < len(state.shuffled_indices):
        raise GameError(422, "Invalid choice index")
    state.votes[player.id] = visual_index


def current_decider(state: GameState) -> Player | None:
    """The player making this scene's choice; None means the storyteller decides."""
    if state.turn_mode == "rotate" and state.players:
        # One turn per choice made, so undoing a choice rewinds the turn too
        return state.players[len(state.history) % len(state.players)]
    if state.turn_mode == "pick":
        return next((p for p in state.players if p.id == state.decider_id), None)
    return None


def join(state: GameState, name: str, token_hash: str) -> Player:
    if state.turn_mode == "storyteller":
        raise GameError(409, "This game doesn't take turns, so there's no need to join by name")
    name = " ".join(name.split())[:24]
    if not name:
        raise GameError(422, "Enter a name")
    if any(p.name.lower() == name.lower() for p in state.players):
        raise GameError(409, f"Someone is already called {name}. Try another name.")
    if len(state.players) >= MAX_PLAYERS:
        raise GameError(409, "The table is full")
    player = Player(id=secrets.token_hex(4), name=name, token_hash=token_hash)
    state.players.append(player)
    return player


def remove_player(state: GameState, player_id: str) -> None:
    """Someone left: drop them from the turn order and from any vote in progress."""
    state.players = [p for p in state.players if p.id != player_id]
    state.vote_eligible = [pid for pid in state.vote_eligible if pid != player_id]
    state.votes.pop(player_id, None)
    if state.decider_id == player_id:
        state.decider_id = None
        state.proposal = None


def set_decider(state: GameState, player_id: str | None) -> None:
    if state.turn_mode != "pick":
        raise GameError(409, "Only in the mode where the storyteller picks who decides")
    if player_id is not None and not any(p.id == player_id for p in state.players):
        raise GameError(404, "No such player")
    state.decider_id = player_id
    state.proposal = None


def propose(state: GameState, player: Player, visual_index: int | None) -> None:
    """The decider leans towards a choice (the storyteller still confirms it). None withdraws it."""
    require_status(state, SessionStatus.RUNNING)
    decider = current_decider(state)
    if decider is None or decider.id != player.id:
        raise GameError(403, "It isn't your turn to decide")
    if not state.choices_revealed:
        raise GameError(409, "The choices haven't been dealt yet")
    if visual_index is not None and not 0 <= visual_index < len(state.shuffled_indices):
        raise GameError(422, "Invalid choice index")
    state.proposal = visual_index


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
    state.emblem_options = []  # chosen; the rest needn't travel with every update
    if state.story.opening_scene:
        state.status = SessionStatus.OPENING_SCENE_ACTIVE
    else:
        state.status = SessionStatus.RUNNING


def choose_crest(state: GameState, variant: int) -> None:
    """The table picks the hero's crest as the hero is revealed. Every screen draws it from the answers."""
    require_status(state, SessionStatus.CHARACTER_REVEAL)
    if not 0 <= variant < 1000:
        raise GameError(422, "Invalid crest")
    state.crest = variant
    state.emblem = None


def set_crest_options(state: GameState, round: int, options: list[Emblem]) -> None:
    """Three crests for the table to choose from, on the stage and the phones: emblems from the
    service, or (none) the built-in crests of that round. The first of the three is chosen to start."""
    require_status(state, SessionStatus.CHARACTER_REVEAL)
    if not 0 <= round < 300:
        raise GameError(422, "Invalid round")
    state.crest_round = round
    state.emblem_options = options
    state.crest = round * 3
    state.emblem = options[0] if options else None


def choose_emblem(state: GameState, input: str) -> None:
    """Or one of the emblems on offer, which every screen shows as the hero's crest."""
    require_status(state, SessionStatus.CHARACTER_REVEAL)
    emblem = next((e for e in state.emblem_options if e.input == input), None)
    if emblem is None:
        raise GameError(422, "That emblem isn't on offer")
    state.emblem = emblem


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


def reveal_choices(state: GameState, show_to_players: bool, now: float | None = None) -> None:
    """Shuffle the current scene's choices (once), optionally pushing them to players.
    In voting games, dealing the choices to the table opens the vote."""
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
        if state.turn_mode == "vote" and not state.vote_eligible and state.players:
            now = time.time() if now is None else now
            seconds = state.story.settings.vote_seconds
            state.vote_eligible = [p.id for p in state.players]
            state.vote_deadline = now + seconds if seconds > 0 else None
            state.votes = {}


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
        item_icon=choice.item_icon if choice.kind == ChoiceKind.ITEM else None,
        item_description=(choice.item_description or None) if choice.kind == ChoiceKind.ITEM else None,
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
    state.decider_id = None
    state.proposal = None
    _clear_vote(state)


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


ROLL_TARGET = 20


def awaiting_roll(state: GameState) -> bool:
    """The finale has come and the dice haven't decided it yet."""
    if state.outcome is not None:
        return False
    if state.status == SessionStatus.GAME_OVER:
        return True
    if state.status == SessionStatus.RUNNING and state.story:
        scene = get_scene(state.story, state.current_scene_id)
        return bool(scene and scene.is_finale)
    return False


def roll(state: GameState, attempt: int, rng=lambda: secrets.randbelow(20) + 1) -> int:
    """Roll the d20 for one attempt (one per level, each plus a bonus per item). 20 or more wins;
    running out of attempts loses. The outcome waits for the storyteller to reveal it.
    `attempt` is the attempt the roller saw, so two phones tapping at once can't spend two."""
    if not awaiting_roll(state):
        raise GameError(409, "There's nothing to roll for")
    if not state.roll_offered:
        raise GameError(409, "The storyteller hasn't offered the digital roll")
    if attempt != len(state.final_rolls):
        raise GameError(409, "That roll has already been made")
    value = rng()
    _apply_roll(state, value)
    return value


def record_roll(state: GameState, attempt: int, value: int) -> None:
    """Real dice: the storyteller enters what the table rolled, and it counts like a digital roll."""
    if not awaiting_roll(state):
        raise GameError(409, "There's nothing to roll for")
    if state.roll_offered:
        raise GameError(409, "The phones are rolling the digital d20")
    if not 1 <= value <= 20:
        raise GameError(422, "A d20 rolls 1 to 20")
    if attempt != len(state.final_rolls):
        raise GameError(409, "That roll has already been entered")
    _apply_roll(state, value)


def undo_roll(state: GameState) -> None:
    """Real dice: take back the last roll entered (a typo), until the outcome is revealed."""
    if state.roll_offered or not state.final_rolls or state.outcome_revealed:
        raise GameError(409, "There's no roll to take back")
    state.final_rolls.pop()
    state.outcome = None
    scene = get_scene(state.story, state.current_scene_id) if state.story else None
    if scene and scene.is_finale:
        state.status = SessionStatus.RUNNING


def _apply_roll(state: GameState, value: int) -> None:
    state.final_rolls.append(value)
    if value + len(state.items) >= ROLL_TARGET:
        state.outcome = "victory"
    elif len(state.final_rolls) >= state.level:
        state.outcome = "defeat"
    if state.outcome:
        state.status = SessionStatus.GAME_OVER
        state.outcome_revealed = False


def offer_roll(state: GameState, offered: bool) -> None:
    """The storyteller sends the digital d20 to the phones, or takes it back for real dice before anyone rolls."""
    if not awaiting_roll(state):
        raise GameError(409, "There's nothing to roll for")
    if not offered and state.final_rolls:
        raise GameError(409, "The dice are already rolling")
    state.roll_offered = offered


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
