"""Data models for stories and session state."""

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

# Where a link goes when it ends the story (the finale roll), instead of naming a scene
END = "end"


class ThemeName(str, Enum):
    CYBERPUNK = "cyberpunk"
    FANTASY = "fantasy"
    DEEP_SPACE = "deep_space"
    MODERN = "modern"
    HORROR = "horror"
    INSANITY = "insanity"


class SessionStatus(str, Enum):
    MADLIB_IN_PROGRESS = "madlib_in_progress"
    CHARACTER_REVEAL = "character_reveal"  # Storyteller reads character to players
    OPENING_SCENE_ACTIVE = "opening_scene_active"
    RUNNING = "running"
    AWAITING_SCENE_SELECTION = "awaiting_scene_selection"
    GAME_OVER = "game_over"


class ChoiceKind(str, Enum):
    DAMAGE = "damage"
    ITEM = "item"
    LEVEL = "level"


class ConditionType(str, Enum):
    HP = "hp"
    ITEMS = "items"
    LEVEL = "level"
    SCENE_OUTCOME = "scene_outcome"
    ITEM_HELD = "item_held"


class Condition(BaseModel):
    type: ConditionType
    op: Optional[Literal["lte", "gte", "eq"]] = None
    value: Optional[int] = None
    scene_id: Optional[str] = None
    outcome: Optional[Literal["damage", "item", "level"]] = None
    item_id: Optional[str] = None  # item_held: an item from the story's catalogue


class ConditionalText(BaseModel):
    condition: Condition
    text: str


class OpeningChoice(BaseModel):
    text: str
    target_scene_id: Optional[str] = None  # None = go to scene selection


class OpeningScene(BaseModel):
    title: str
    base_text: str
    choices: list[OpeningChoice] = []
    conditional_text: list[ConditionalText] = []


class ItemDef(BaseModel):
    """An item the story can give, defined once: choices, conditions and finale texts point at its id."""
    id: str
    name: str
    icon: Optional[str] = Field(None, max_length=32)  # None = picked from the item's name
    description: Optional[str] = Field(None, max_length=600)  # Flavour text, shown when a player opens it in the backpack


class Choice(BaseModel):
    kind: ChoiceKind
    display_text: str  # What players see when choosing (e.g., "Do you choose to...")
    result_text: str   # What storyteller reads after choice is made
    amount: int = 1
    item_id: Optional[str] = None  # Item choices: the item from the story's catalogue
    next_scene_id: Optional[str] = None  # Where this choice leads (a scene id or END); None = where the scene goes next
    # Older stories kept the item on the choice; loading moves it into the catalogue (Story.items)
    item_name: Optional[str] = None
    item_icon: Optional[str] = Field(None, max_length=32)
    item_description: Optional[str] = Field(None, max_length=600)


class Route(BaseModel):
    """After a choice that doesn't say where it leads: if the condition holds, go to target (a scene id or END)."""
    condition: Condition
    target: str = ""


class Scene(BaseModel):
    id: str
    title: str
    display_name: Optional[str] = None  # Poetic/descriptive name for scene selection
    base_text: str
    choices: list[Choice] = []  # Empty for finale scenes
    conditional_text: list[ConditionalText] = []
    is_finale: bool = False  # If true, this is the final die-roll scene
    finale_setup_text: Optional[str] = None  # Read before die roll
    victory_text: Optional[str] = None  # Read on victory
    defeat_text: Optional[str] = None  # Read on defeat
    # Item-conditional text blocks for finale: { item_id: { "victory": "...", "defeat": "..." } }
    item_texts: dict[str, dict[str, str]] = {}
    # Where the story goes after this scene, when the choice doesn't say: routes in order, then next
    routes: list[Route] = []
    next: Optional[str] = None  # a scene id or END; None = the next scene in the list (or back to the doors)
    requires: list[Condition] = []  # Door stories: the door stays locked until all of these hold
    mood: Optional[str] = None  # Backdrop mood within the story's theme; None = picked automatically
    ambience: Optional[str] = None  # Uploaded audio file to loop; None = story default, "none" = silence


class MadLibField(BaseModel):
    key: str
    label: str
    hint: Optional[str] = None  # Grammar hint (e.g., "verb, past tense")


class MadLibTemplate(BaseModel):
    prompt: str
    fields: list[MadLibField]


class StorySettings(BaseModel):
    starting_hp: int = 3
    non_linear: bool = False
    vote_seconds: int = 60  # Voting games: how long the table has to vote (0 = no limit)


class StorySound(BaseModel):
    ambience: Optional[str] = None  # Default looping audio (an uploaded file name)
    stings: dict[str, str] = {}  # Moment type (hp_lost, victory…) -> uploaded file name


class NodePosition(BaseModel):
    x: float
    y: float


class Story(BaseModel):
    id: str
    title: str
    theme: ThemeName = ThemeName.CYBERPUNK
    settings: StorySettings = StorySettings()
    madlib_template: MadLibTemplate
    scenes: list[Scene]
    opening_scene: Optional[OpeningScene] = None
    sound: StorySound = StorySound()
    items: list[ItemDef] = []  # Every item the story can give
    layout: dict[str, NodePosition] = {}  # Editor only: where each node sits in the Flow view

    @model_validator(mode="after")
    def _items_into_catalogue(self) -> "Story":
        """Older stories named an item on the choice that gives it. Move each into the catalogue
        (the same name is the same item) and point the choice, and finale item texts, at it."""
        by_name = {item.name: item for item in self.items}
        taken = {item.id for item in self.items}
        for scene in self.scenes:
            for choice in scene.choices:
                name = (choice.item_name or "").strip()
                if choice.kind == ChoiceKind.ITEM and name and not choice.item_id:
                    item = by_name.get(name)
                    if item is None:
                        item = ItemDef(id=_unique_id(name, taken), name=name, icon=choice.item_icon, description=choice.item_description or None)
                        self.items.append(item)
                        by_name[name] = item
                    else:
                        item.icon = item.icon or choice.item_icon
                        item.description = item.description or choice.item_description or None
                    choice.item_id = item.id
                choice.item_name = choice.item_icon = choice.item_description = None
        ids = {item.id for item in self.items}
        for scene in self.scenes:
            if any(key not in ids and key in by_name for key in scene.item_texts):
                scene.item_texts = {
                    by_name[key].id if key not in ids and key in by_name else key: texts
                    for key, texts in scene.item_texts.items()
                }
        return self


def _unique_id(name: str, taken: set[str]) -> str:
    words = "".join(ch if ch.isalnum() else " " for ch in name.lower().replace("'", "").replace("’", ""))
    base = "item_" + ("_".join(words.split()) or "thing")
    candidate, n = base, 2
    while candidate in taken:
        candidate, n = f"{base}_{n}", n + 1
    taken.add(candidate)
    return candidate


class HistoryEntry(BaseModel):
    scene_id: str
    outcome: ChoiceKind
    choice_index: int
    item_name: Optional[str] = None
    item_icon: Optional[str] = None
    item_description: Optional[str] = None
    item_id: Optional[str] = None
    damage_amount: int = 1
    decided_by: Optional[str] = None  # the player who made this choice (turn-taking games)


class Emblem(BaseModel):
    """A crest from the emblem service: the SVG is kept, so screens never need the service again."""
    theme: str
    input: str
    version: int
    description: str = ""
    svg: str


class Character(BaseModel):
    name: str
    description: str
    fields: dict[str, str]


TurnMode = Literal["storyteller", "rotate", "pick", "vote"]


class Player(BaseModel):
    """Someone at the table who joined by name (only in the turn-taking modes)."""
    id: str
    name: str
    token_hash: str = ""  # Private: proves a phone is this player


class GameState(BaseModel):
    session_id: str = ""  # Identifier in player URLs
    story_id: str
    status: SessionStatus = SessionStatus.MADLIB_IN_PROGRESS
    madlib_step: int = 0
    madlib_answers: dict[str, str] = {}
    current_scene_id: str
    hp: int
    level: int = 1
    items: list[str] = []
    history: list[HistoryEntry] = []
    character: Optional[Character] = None
    outcome: Optional[Literal["victory", "defeat"]] = None
    outcome_revealed: bool = False
    choices_revealed: bool = False
    shuffled_indices: list[int] = []
    # Who makes each choice: the storyteller (default), players in turn, or a player the storyteller picks
    turn_mode: TurnMode = "storyteller"
    players: list[Player] = []
    decider_id: Optional[str] = None  # "pick" mode: chosen per scene
    proposal: Optional[int] = None  # Visual index of the choice the decider is leaning towards
    doors_dealt: bool = False  # Non-linear stories: the storyteller has shown the doors on the phones
    door_proposal: Optional[str] = None  # Non-linear stories: the scene id of the door the decider is leaning towards
    # Voting games: who may vote this scene (players at the table when the choices were dealt)
    vote_eligible: list[str] = []
    vote_deadline: Optional[float] = None  # epoch seconds; None = no time limit
    votes: dict[str, int] = {}  # Private: player id -> visual index. Only the storyteller sees the tally
    no_flashing: bool = False  # The whole table asked for calm effects: every screen caps at "subtle"
    crest: int = 0  # Which of the hero's generated crests the table chose (clients draw it from the answers)
    emblem: Optional[Emblem] = None  # Or the emblem the table chose from the emblem service (wins over crest)
    crest_round: Optional[int] = None  # Which three crests the table is choosing from (None until the stage asks)
    emblem_options: list[Emblem] = []  # Those three from the emblem service; empty = the built-in crests of crest_round
    roll_offered: bool = False  # The storyteller sent the digital d20 to the phones (otherwise the table rolls real dice)
    final_rolls: list[int] = []  # The digital d20s rolled at the finale, in order (the app rolls; a player taps)
    roller_id: Optional[str] = None  # Who holds the digital d20 in games with names; None = the storyteller rolls
    last_roll_at: Optional[float] = None  # epoch seconds of the last digital roll, so each one lands before the next
    # Private: never sent to clients (see public_state)
    story: Optional[Story] = None  # Snapshot taken at /start, so editing a story can't break a game
    token_hash: str = ""  # sha256 of the storyteller token, so sessions survive restarts


PRIVATE_STATE_FIELDS = {"story": True, "token_hash": True, "votes": True, "players": {"__all__": {"token_hash"}}}


def public_state(state: GameState | None) -> dict | None:
    """State as clients see it: no story snapshot, no token hashes."""
    if state is None:
        return None
    return state.model_dump(mode="json", exclude=PRIVATE_STATE_FIELDS)
