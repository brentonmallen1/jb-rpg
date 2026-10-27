"""Data models for stories and session state."""

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel


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


class Condition(BaseModel):
    type: ConditionType
    op: Optional[Literal["lte", "gte", "eq"]] = None
    value: Optional[int] = None
    scene_id: Optional[str] = None
    outcome: Optional[Literal["damage", "item", "level"]] = None


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


class Choice(BaseModel):
    kind: ChoiceKind
    display_text: str  # What players see when choosing (e.g., "Do you choose to...")
    result_text: str   # What storyteller reads after choice is made
    amount: int = 1
    item_name: Optional[str] = None


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
    # Item-conditional text blocks for finale: { "ItemName": { "victory": "...", "defeat": "..." } }
    item_texts: dict[str, dict[str, str]] = {}
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


class Story(BaseModel):
    id: str
    title: str
    theme: ThemeName = ThemeName.CYBERPUNK
    settings: StorySettings = StorySettings()
    madlib_template: MadLibTemplate
    scenes: list[Scene]
    opening_scene: Optional[OpeningScene] = None
    sound: StorySound = StorySound()


class HistoryEntry(BaseModel):
    scene_id: str
    outcome: ChoiceKind
    choice_index: int
    item_name: Optional[str] = None
    damage_amount: int = 1


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
    # Voting games: who may vote this scene (players at the table when the choices were dealt)
    vote_eligible: list[str] = []
    vote_deadline: Optional[float] = None  # epoch seconds; None = no time limit
    votes: dict[str, int] = {}  # Private: player id -> visual index. Only the storyteller sees the tally
    # Private: never sent to clients (see public_state)
    story: Optional[Story] = None  # Snapshot taken at /start, so editing a story can't break a game
    token_hash: str = ""  # sha256 of the storyteller token, so sessions survive restarts


PRIVATE_STATE_FIELDS = {"story": True, "token_hash": True, "votes": True, "players": {"__all__": {"token_hash"}}}


def public_state(state: GameState | None) -> dict | None:
    """State as clients see it: no story snapshot, no token hashes."""
    if state is None:
        return None
    return state.model_dump(mode="json", exclude=PRIVATE_STATE_FIELDS)
