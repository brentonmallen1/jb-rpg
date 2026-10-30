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
    END,
    Character,
    ChoiceKind,
    Condition,
    ConditionType,
    Emblem,
    GameState,
    HistoryEntry,
    ItemDef,
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
            # Named in the text (so it reads well), keyed by the item's id in item_texts
            item = find_item(state.story, key[len("item_text:"):]) if state and state.story else None
            item_entry = (item_texts or {}).get(item.id) if item else None
            if item_entry and holds_item(state, item.id):
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


def find_item(story: Story, ref: str) -> ItemDef | None:
    """An item from the story's catalogue, by id or by name."""
    return next((i for i in story.items if i.id == ref), None) or next((i for i in story.items if i.name == ref), None)


def holds_item(state: GameState, item_id: str) -> bool:
    """Has the hero found this item, anywhere so far? (History, so Back takes it away again.)"""
    item = find_item(state.story, item_id) if state.story else None
    return any(
        entry.item_id == item_id or (entry.item_id is None and item is not None and entry.item_name == item.name)
        for entry in state.history
        if entry.outcome == ChoiceKind.ITEM
    )


def evaluate_condition(condition: Condition, state: GameState) -> bool:
    if condition.type == ConditionType.SCENE_OUTCOME:
        for entry in state.history:
            if entry.scene_id == condition.scene_id:
                return entry.outcome.value == condition.outcome
        return False

    if condition.type == ConditionType.ITEM_HELD:
        return bool(condition.item_id) and holds_item(state, condition.item_id)

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


def doors_text(state: GameState) -> str | None:
    """Door stories, back at the doors after a room: the prologue's lines that change and now hold
    (the prologue itself is read once, before any room). Storyteller and TV only."""
    story = state.story
    if state.status != SessionStatus.AWAITING_SCENE_SELECTION or not state.history or not story.opening_scene:
        return None
    fields = state.character.fields if state.character else None
    lines = [inject_variables(ct.text, fields) for ct in story.opening_scene.conditional_text if evaluate_condition(ct.condition, state)]
    return " ".join(lines) or None


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
        # During a scene, or choosing the next door: the turn begins when the scene (or the door) does
        "decider": _player_ref(current_decider(state)) if state.status in (SessionStatus.RUNNING, SessionStatus.AWAITING_SCENE_SELECTION) else None,
        "doors": open_doors(state) if state.status == SessionStatus.AWAITING_SCENE_SELECTION else None,
        "doors_text": doors_text(state),
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
            "roller": _player_ref(roller(state)),
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
    """What phones get. While the storyteller tells a scene (until its choices are revealed on the
    stage or dealt), `scene_text_pending` says so: phones show the story being told, and a player
    can choose to read along."""
    if resolved and state is not None and state.status == SessionStatus.AWAITING_SCENE_SELECTION:
        # The doors reach the phones once the storyteller deals them; the words read at the doors stay on the stage
        return {**resolved, "doors": resolved["doors"] if state.doors_dealt else None, "doors_text": None}
    told = state is not None and (state.choices_revealed or bool(state.shuffled_indices))
    if not resolved or state is None or state.status != SessionStatus.RUNNING or told:
        return resolved
    scene = get_scene(state.story, state.current_scene_id) if state.story else None
    if scene is None or not scene.choices or not resolved.get("scene_text"):
        return resolved
    return {**resolved, "scene_text_pending": True}


# ---------------------------------------------------------------------------
# Story checks
# ---------------------------------------------------------------------------


def get_scene(story: Story, scene_id: str) -> Scene | None:
    return next((s for s in story.scenes if s.id == scene_id), None)


# ---------------------------------------------------------------------------
# Paths: where each scene can lead
# ---------------------------------------------------------------------------

DOORS = "doors"  # Door stories: back to choosing the next door (never stored in a story)


def linked_scene_ids(story: Story) -> set[str]:
    """Scenes that a choice, route or "after this scene" leads to."""
    linked = set()
    for scene in story.scenes:
        linked.update(c.next_scene_id for c in scene.choices if c.next_scene_id)
        linked.update(r.target for r in scene.routes if r.target)
        if scene.next:
            linked.add(scene.next)
    return linked


def door_scenes(story: Story) -> list[Scene]:
    """Door stories: the scenes the table chooses between. A scene something leads to is a room
    behind a door, not a door."""
    linked = linked_scene_ids(story)
    return [s for s in story.scenes if s.id not in linked]


def default_next(story: Story, scene: Scene) -> str:
    """Where a scene goes when nothing says otherwise: back to the doors, or the next scene in the list."""
    if story.settings.non_linear:
        return DOORS
    ids = [s.id for s in story.scenes]
    i = ids.index(scene.id)
    return ids[i + 1] if i + 1 < len(ids) else END


def scene_exits(story: Story, scene: Scene) -> list[str]:
    """Everywhere a scene can lead: scene ids, END, or DOORS."""
    if scene.is_finale or not scene.choices:
        return [END]
    exits = [c.next_scene_id for c in scene.choices if c.next_scene_id]
    if any(not c.next_scene_id for c in scene.choices):
        exits += [r.target for r in scene.routes if r.target]
        exits.append(scene.next or default_next(story, scene))
    return list(dict.fromkeys(exits))


def story_starts(story: Story) -> list[str]:
    """Where play can begin, after the opening scene if there is one."""
    if not story.scenes:
        return []
    opening = story.opening_scene
    if opening is None:
        return [story.scenes[0].id]
    if not opening.choices:
        return [DOORS if story.settings.non_linear else story.scenes[0].id]
    first = DOORS if story.settings.non_linear else story.scenes[0].id
    return list(dict.fromkeys(c.target_scene_id or first for c in opening.choices))


def reachable_scene_ids(story: Story) -> set[str]:
    seen: set[str] = set()
    todo = story_starts(story)
    while todo:
        node = todo.pop()
        if node in seen or node == END:
            continue
        seen.add(node)
        if node == DOORS:
            todo += [s.id for s in door_scenes(story)]
        elif (scene := get_scene(story, node)) is not None:
            todo += scene_exits(story, scene)
    return {n for n in seen if n != DOORS}


def scene_loops(story: Story) -> list[list[str]]:
    """Paths that lead back to a scene already played on the way (each loop once, as scene ids)."""
    ids = {s.id for s in story.scenes}
    graph = {s.id: [t for t in scene_exits(story, s) if t in ids and t != s.id] for s in story.scenes}
    loops, visited = [], {}  # visited: scene id -> "open" (on the current path) or "done"

    # Depth first without recursion, so a long story can't run out of stack:
    # the path so far, and the exits each scene on it has left to follow
    for root in graph:
        if root in visited:
            continue
        visited[root] = "open"
        path, exits = [root], [iter(graph[root])]
        while path:
            nxt = next(exits[-1], None)
            if nxt is None:
                visited[path.pop()] = "done"
                exits.pop()
            elif visited.get(nxt) == "open":
                loops.append(path[path.index(nxt):] + [nxt])
            elif nxt not in visited:
                visited[nxt] = "open"
                path.append(nxt)
                exits.append(iter(graph[nxt]))
    return loops


def scenes_to_go(story: Story, scene_id: str) -> tuple[int, int] | None:
    """The fewest and most scenes left to play from here (this one included), down every path.
    None in door stories, where the table chooses the order."""
    scenes = {s.id: s for s in story.scenes}
    if story.settings.non_linear or scene_id not in scenes:
        return None
    exits: dict[str, list[str]] = {}
    memo: dict[str, tuple[int, int]] = {}

    def exits_of(sid: str) -> list[str]:
        if sid not in exits:
            exits[sid] = scene_exits(story, scenes[sid])
        return exits[sid]

    # Depth first without recursion: a scene is counted once every scene it leads to is.
    # A game's story has no loops (/start refuses them), but a link back along the path is skipped
    path, on_path, todo = [scene_id], {scene_id}, [iter(exits_of(scene_id))]
    while path:
        nxt = next((t for t in todo[-1] if t in scenes and t not in memo and t not in on_path), None)
        if nxt is not None:
            path.append(nxt)
            on_path.add(nxt)
            todo.append(iter(exits_of(nxt)))
            continue
        sid = path.pop()
        on_path.discard(sid)
        todo.pop()
        ahead = [memo[t] for t in exits_of(sid) if t in memo]
        ends = END in exits_of(sid) or not ahead
        lo = 0 if ends else min(a for a, _ in ahead)
        hi = max((b for _, b in ahead), default=0)
        memo[sid] = (1 + lo, 1 + hi)
    return memo[scene_id]


def is_branching(story: Story) -> bool:
    """Does anything in the story say where it leads (rather than going down the list)?"""
    return any(s.next or s.routes or any(c.next_scene_id for c in s.choices) for s in story.scenes)


def path_progress(state: GameState) -> dict | None:
    """Storyteller only, in branching stories (where "scene 3 of 6" means nothing): scenes played,
    and the fewest and most that may be left, this one included."""
    story = state.story
    if story is None or story.settings.non_linear or not is_branching(story):
        return None
    if state.status == SessionStatus.GAME_OVER:
        to_go = (0, 0)
    elif state.status == SessionStatus.RUNNING:
        to_go = scenes_to_go(story, state.current_scene_id) or (0, 0)
    else:
        spans = [scenes_to_go(story, sid) for sid in story_starts(story) if sid != DOORS]
        spans = [s for s in spans if s] or [(0, 0)]
        to_go = (min(a for a, _ in spans), max(b for _, b in spans))
    return {"played": len(state.history), "to_go": list(to_go)}


def story_conditions(story: Story):
    """Every condition in the story, with where it is: (where, scene or None for the prologue, condition).
    Lines that change, routes and door locks."""
    for scene in story.scenes:
        where = f"Scene '{scene.title or scene.id}'"
        for c in [ct.condition for ct in scene.conditional_text] + [r.condition for r in scene.routes] + list(scene.requires):
            yield where, scene, c
    if story.opening_scene:
        for ct in story.opening_scene.conditional_text:
            yield "Opening scene", None, ct.condition


def story_problems(story: Story) -> list[dict]:
    """Everything that would break a game of this story, and a few things that would only surprise.
    Empty means ready to play.

    Each problem says where it is, so the editor can point at it:
    {"message", "area": story|characters|opening|scene|items, "scene_id", "field", "index", "severity", "code"}.
    Warnings carry a code (unreachable, item_never_given, unknown_item_text) so the editor needn't read the words.
    Saving never enforces these (the editor autosaves half-finished work); starting a game refuses
    errors and lets warnings (a scene nothing leads to, an item nothing gives) through.
    """
    problems: list[dict] = []

    def add(message: str, area: str, scene_id: str | None = None, field: str | None = None, index: int | None = None, warning: str | None = None):
        """warning: the warning's code; without one, the problem is an error."""
        problems.append({
            "message": message, "area": area, "scene_id": scene_id, "field": field, "index": index,
            "severity": "warning" if warning else "error", "code": warning,
        })

    if not story.scenes:
        add("The story has no scenes.", "story")

    seen = set()
    for scene in story.scenes:
        if scene.id in seen:
            add(f"Scene id '{scene.id}' is used more than once.", "scene", scene.id)
        if scene.id in (END, DOORS):
            add(f"A scene can't use the id '{scene.id}'.", "scene", scene.id)
        seen.add(scene.id)
    titles = {s.id: s.title or s.id for s in story.scenes}

    keys = [f.key for f in story.madlib_template.fields]
    if any(not k.strip() for k in keys):
        add("A character creation question has no key.", "characters")
    if len(set(keys)) != len(keys):
        add("Two character creation questions share the same key.", "characters")

    item_ids = {item.id for item in story.items}
    names: set[str] = set()
    for i, item in enumerate(story.items):
        name = item.name.strip()
        if not name:
            add("An item has no name.", "items", None, "name", i)
        elif name.lower() in names:
            add(f"Two items are both called '{name}'.", "items", None, "name", i)
        names.add(name.lower())

    def condition_problem(c: Condition, noun: str) -> str | None:
        if c.type == ConditionType.SCENE_OUTCOME:
            if not c.scene_id or not c.outcome:
                return f"{noun} that depends on an earlier scene needs the scene and how it went"
            if c.scene_id not in seen:
                return f"{noun} depends on a scene that no longer exists ('{c.scene_id}')"
        elif c.type == ConditionType.ITEM_HELD:
            if not c.item_id:
                return f"{noun} that depends on an item needs the item"
            if c.item_id not in item_ids:
                return f"{noun} depends on an item that no longer exists"
        elif not c.op or c.value is None:
            stat = {"hp": "health", "items": "number of items", "level": "level"}[c.type.value]
            return f"{noun} that depends on the hero's {stat} needs a comparison and a number"
        return None

    def check_conditions(where: str, area: str, scene_id: str | None, conditional_text):
        for i, ct in enumerate(conditional_text):
            if (problem := condition_problem(ct.condition, "a line")):
                add(f"{where}: {problem}.", area, scene_id, "conditional_text", i)

    def check_target(where: str, scene: Scene, target: str | None, what: str, field: str, index: int | None = None):
        if not target or target == END:
            return
        if target == scene.id:
            add(f"{where}: {what} leads back to this same scene.", "scene", scene.id, field, index)
        elif target not in seen:
            add(f"{where}: {what} leads to a scene that doesn't exist ('{target}').", "scene", scene.id, field, index)

    given: set[str] = set()
    checked: dict[str, str] = {}  # item id -> where it's checked first
    for scene in story.scenes:
        where = f"Scene '{scene.title or scene.id}'"
        if not scene.is_finale and not scene.choices:
            add(f"{where} has no choices. Add some, or mark it as the finale.", "scene", scene.id, "choices")
        for i, choice in enumerate(scene.choices):
            if choice.kind == ChoiceKind.ITEM:
                if not choice.item_id:
                    add(f"{where}: an item choice has no item.", "scene", scene.id, "item_id", i)
                elif choice.item_id not in item_ids:
                    add(f"{where}: an item choice gives an item that no longer exists.", "scene", scene.id, "item_id", i)
                else:
                    given.add(choice.item_id)
            check_target(where, scene, choice.next_scene_id, "a choice", "next_scene_id", i)
        check_conditions(where, "scene", scene.id, scene.conditional_text)
        for i, route in enumerate(scene.routes):
            if not route.target:
                add(f"{where}: a route has nowhere to go.", "scene", scene.id, "routes", i)
            check_target(where, scene, route.target, "a route", "routes", i)
            if (problem := condition_problem(route.condition, "a route")):
                add(f"{where}: {problem}.", "scene", scene.id, "routes", i)
        check_target(where, scene, scene.next, "what comes after it", "next")
        for i, c in enumerate(scene.requires):
            if (problem := condition_problem(c, "a lock")):
                add(f"{where}: {problem}.", "scene", scene.id, "requires", i)
        for key in scene.item_texts:
            if key in item_ids:
                checked.setdefault(key, where)
            else:
                add(f"{where}: there's finale text for an item that isn't in the story ('{key}').", "scene", scene.id, "item_texts", warning="unknown_item_text")

    if story.opening_scene:
        for i, choice in enumerate(story.opening_scene.choices):
            if choice.target_scene_id and choice.target_scene_id not in seen:
                add(f"Opening scene: a choice leads to a scene that doesn't exist ('{choice.target_scene_id}').", "opening", None, "target_scene_id", i)
        check_conditions("Opening scene", "opening", None, story.opening_scene.conditional_text)

    for where, _, c in story_conditions(story):
        if c.type == ConditionType.ITEM_HELD and c.item_id:
            checked.setdefault(c.item_id, where)

    for i, item in enumerate(story.items):
        if item.id in checked and item.id not in given:
            add(f"{checked[item.id]} checks for '{item.name or item.id}', but no choice gives it.", "items", None, "id", i, warning="item_never_given")

    for loop in scene_loops(story):
        path = " → ".join(titles[sid] for sid in loop)
        add(f"These scenes go round in a loop: {path}. A path has to reach an end.", "scene", loop[0], "next")

    if story.scenes:
        reachable = reachable_scene_ids(story)
        for scene in story.scenes:
            if scene.id not in reachable:
                add(f"Scene '{scene.title or scene.id}': no path leads here.", "scene", scene.id, None, warning="unreachable")

    return problems


# ---------------------------------------------------------------------------
# Transitions
# ---------------------------------------------------------------------------


def require_status(state: GameState, *allowed: SessionStatus) -> None:
    if state.status not in allowed:
        expected = " or ".join(s.value for s in allowed)
        raise GameError(409, f"Not allowed in status {state.status.value} (needs {expected})")


def new_session(story: Story, turn_mode: str = "storyteller", no_flashing: bool = False) -> GameState:
    problems = [p for p in story_problems(story) if p["severity"] == "error"]
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
    state.roller_id = None
    state.last_roll_at = None
    state.choices_revealed = False
    state.shuffled_indices = []
    state.decider_id = None
    state.proposal = None
    state.door_proposal = None
    state.doors_dealt = False
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
        state.door_proposal = None
    if state.roller_id == player_id:
        state.roller_id = None


def set_decider(state: GameState, player_id: str | None) -> None:
    if state.turn_mode != "pick":
        raise GameError(409, "Only in the mode where the storyteller picks who decides")
    if player_id is not None and not any(p.id == player_id for p in state.players):
        raise GameError(404, "No such player")
    state.decider_id = player_id
    state.proposal = None
    state.door_proposal = None


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


def open_doors(state: GameState) -> list[dict]:
    """Non-linear stories, choosing the next door: every door, and whether it can be opened now.
    Opened ones are played; a door with a lock stays locked until its conditions hold; the last
    door is sealed while any other door can still be opened."""
    story = state.story
    played = {h.scene_id for h in state.history}
    doors = door_scenes(story)
    locked = {s.id for s in doors if not all(evaluate_condition(c, state) for c in s.requires)}
    others_open = any(not s.is_finale and s.id not in played and s.id not in locked for s in doors)
    return [
        {
            "id": s.id,
            "title": s.display_name or s.title,
            "last": bool(s.is_finale),
            "played": s.id in played,
            "locked": s.id in locked and s.id not in played,
            "sealed": bool(s.is_finale) and others_open,
            "open": s.id not in played and s.id not in locked and not (s.is_finale and others_open),
        }
        for s in doors
    ]


def deal_doors(state: GameState) -> None:
    """Show the doors on the phones, so the table (and whoever's turn it is) can choose."""
    require_status(state, SessionStatus.AWAITING_SCENE_SELECTION)
    state.doors_dealt = True


def propose_door(state: GameState, player: Player, scene_id: str | None) -> None:
    """The decider leans towards a door (the storyteller still opens it). None withdraws it."""
    require_status(state, SessionStatus.AWAITING_SCENE_SELECTION)
    decider = current_decider(state)
    if decider is None or decider.id != player.id:
        raise GameError(403, "It isn't your turn to decide")
    if not state.doors_dealt:
        raise GameError(409, "The doors haven't been dealt yet")
    if scene_id is not None and scene_id not in {d["id"] for d in open_doors(state) if d["open"]}:
        raise GameError(422, "That door can't be opened")
    state.door_proposal = scene_id


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
        elif story.settings.non_linear:
            state.status = SessionStatus.AWAITING_SCENE_SELECTION
        else:
            _enter_scene(state, story.scenes[0].id)
            state.status = SessionStatus.RUNNING
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

    item = find_item(story, choice.item_id) if choice.kind == ChoiceKind.ITEM and choice.item_id else None
    if choice.kind == ChoiceKind.ITEM and item is None:
        raise GameError(422, "Item choice must give an item from the story")

    if choice.kind == ChoiceKind.DAMAGE:
        state.hp -= choice.amount
    elif choice.kind == ChoiceKind.ITEM:
        state.items.append(item.name)
    elif choice.kind == ChoiceKind.LEVEL:
        state.level += 1

    # History keeps the item as it was found, so the backpack, Back and the keepsake never re-read the story
    state.history.append(HistoryEntry(
        scene_id=state.current_scene_id,
        outcome=choice.kind,
        choice_index=original_index,
        item_id=item.id if item else None,
        item_name=item.name if item else None,
        item_icon=item.icon if item else None,
        item_description=(item.description or None) if item else None,
        damage_amount=choice.amount,
        decided_by=decider.id if (decider := current_decider(state)) else None,
    ))

    if state.hp <= 0:
        state.hp = 0
        state.status = SessionStatus.GAME_OVER
        state.outcome = "defeat"
        state.outcome_revealed = True
    else:
        target = next_target(state, scene, choice)
        if target == DOORS and any(d["open"] for d in open_doors(state)):
            state.status = SessionStatus.AWAITING_SCENE_SELECTION
        elif target not in (END, DOORS):
            _enter_scene(state, target)
            return
        else:
            # The end of a path, or no door left to open
            state.status = SessionStatus.GAME_OVER
            state.outcome = None  # awaiting the physical dice roll
    state.choices_revealed = False
    state.shuffled_indices = []
    state.decider_id = None
    state.proposal = None
    state.door_proposal = None
    state.doors_dealt = False
    _clear_vote(state)


def next_target(state: GameState, scene: Scene, choice) -> str:
    """Where the story goes after this choice (already applied to the state): the choice's own path,
    else the first route whose condition holds, else where the scene goes next, else the next
    scene in the list (or back to the doors). A scene id, END or DOORS."""
    story = state.story
    target = choice.next_scene_id
    if not target:
        target = next((r.target for r in scene.routes if r.target and evaluate_condition(r.condition, state)), None)
    target = target or scene.next or default_next(story, scene)
    if target in (END, DOORS) or get_scene(story, target) is not None:
        return target
    return default_next(story, scene)  # a link to a scene that's gone (story_problems stops this at /start)


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

    door = next((d for d in open_doors(state) if d["id"] == scene_id), None)
    if door is None:
        raise GameError(400, f"That scene isn't a door: {scene_id}")
    if door["sealed"]:
        raise GameError(400, "Complete all scenes before accessing the finale")
    if door["locked"]:
        raise GameError(400, "That door is locked")

    played = {h.scene_id for h in state.history}

    if scene_id in played:
        if not revisit:
            raise GameError(400, f"Scene already played: {scene_id}")
        # Revisit: forget that scene's outcome and recalculate
        state.history = [h for h in state.history if h.scene_id != scene_id]
        _restore_from_history(state)

    # Whoever the storyteller picked to choose the door decides what happens behind it
    decider_id = state.decider_id
    _enter_scene(state, scene_id)
    state.decider_id = decider_id
    state.status = SessionStatus.RUNNING


ROLL_TARGET = 20
ROLL_PAUSE = 3.0  # seconds between digital rolls, so each one lands on every screen before the next


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


def roller(state: GameState) -> Player | None:
    """The player holding the digital d20. None: only the storyteller can roll it."""
    return next((p for p in state.players if p.id == state.roller_id), None)


def roll(
    state: GameState,
    attempt: int,
    player: Player | None = None,
    rng=lambda: secrets.randbelow(20) + 1,
    now: float | None = None,
) -> int:
    """Roll the d20 for one attempt (one per level, each plus a bonus per item). 20 or more wins;
    running out of attempts loses. The outcome waits for the storyteller to reveal it.
    `player` is the phone that tapped (None: the storyteller); only the player holding the die may roll.
    `attempt` is the attempt the roller saw, so a second tap can't spend another."""
    if not awaiting_roll(state):
        raise GameError(409, "There's nothing to roll for")
    if not state.roll_offered:
        raise GameError(409, "The storyteller hasn't offered the digital roll")
    if player is not None and state.roller_id != player.id:
        raise GameError(403, "The die is in someone else's hands")
    if attempt != len(state.final_rolls):
        raise GameError(409, "That roll has already been made")
    now = time.time() if now is None else now
    if state.last_roll_at is not None and 0 <= now - state.last_roll_at < ROLL_PAUSE:
        raise GameError(409, "The die is still rolling")
    value = rng()
    state.last_roll_at = now
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
    # Games with names hand the die to whoever's turn it is; the storyteller can pass it on
    decider = current_decider(state) if offered else None
    state.roller_id = decider.id if decider else None


def set_roller(state: GameState, player_id: str | None) -> None:
    """The storyteller hands the digital d20 to a player (None takes it back to the stage)."""
    if not awaiting_roll(state) or not state.roll_offered:
        raise GameError(409, "The digital d20 isn't in play")
    if state.turn_mode == "storyteller":
        raise GameError(409, "Nobody joined by name, so the storyteller rolls")
    if player_id is not None and not any(p.id == player_id for p in state.players):
        raise GameError(404, "No such player")
    state.roller_id = player_id


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
