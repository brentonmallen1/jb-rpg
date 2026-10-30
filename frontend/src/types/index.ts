// Theme names matching backend ThemeName enum: the single list for the frontend
export const THEMES = ['cyberpunk', 'fantasy', 'deep_space', 'modern', 'horror', 'insanity'] as const
export type ThemeName = typeof THEMES[number]

// Session status matching backend SessionStatus enum
export type SessionStatus = 'madlib_in_progress' | 'character_reveal' | 'opening_scene_active' | 'running' | 'awaiting_scene_selection' | 'game_over'

// Choice outcome types
export type ChoiceKind = 'damage' | 'item' | 'level'

// Condition types for conditional text
export type ConditionType = 'hp' | 'items' | 'level' | 'scene_outcome' | 'item_held'
export type ConditionOp = 'lte' | 'gte' | 'eq'

export interface Condition {
  type: ConditionType
  op?: ConditionOp
  value?: number
  scene_id?: string
  outcome?: ChoiceKind
  item_id?: string  // item_held: an item from the story's catalogue
}

export interface ConditionalText {
  condition: Condition
  text: string
}

export interface OpeningChoice {
  text: string
  target_scene_id?: string
}

export interface OpeningScene {
  title: string
  base_text: string
  choices: OpeningChoice[]
  conditional_text: ConditionalText[]
}

/** Where a link ends the story (the d20 finale), instead of naming a scene */
export const END = 'end'

/** An item the story can give, defined once (Story.items); choices, conditions and finale texts point at its id */
export interface ItemDef {
  id: string
  name: string
  icon?: string | null  // unset: picked from the item's name (lib/items.ts)
  description?: string | null  // flavour text, shown when a player opens it in the backpack
}

export interface Choice {
  kind: ChoiceKind
  display_text: string  // What players see when choosing
  result_text: string   // What storyteller reads after choice is made
  amount: number
  item_id?: string | null  // item choices: the item from the story's catalogue
  next_scene_id?: string | null  // where this choice leads (a scene id or END); unset = where the scene goes next
  // Older stories kept the item here; the server moves it into the catalogue. Filled in for display by choiceWithItem
  item_name?: string | null
  item_icon?: string | null
  item_description?: string | null
}

/** After a choice that doesn't say where it leads: if the condition holds, go to target (a scene id or END) */
export interface Route {
  condition: Condition
  target: string
}

export interface Scene {
  id: string
  title: string
  display_name?: string  // Poetic/descriptive name for scene selection
  base_text: string
  choices: Choice[]  // Empty for finale scenes
  conditional_text: ConditionalText[]
  is_finale?: boolean  // If true, this is the final die-roll scene
  finale_setup_text?: string  // Read before die roll
  victory_text?: string  // Read on victory
  defeat_text?: string  // Read on defeat
  item_texts?: Record<string, { victory?: string; defeat?: string }>  // Finale lines per item id, where {item_text:Name} is written
  routes?: Route[]  // checked in order after a choice that doesn't say where it leads
  next?: string | null  // a scene id or END; unset = the next scene in the list (or back to the doors)
  requires?: Condition[]  // door stories: the door stays locked until all of these hold
  mood?: string | null  // backdrop mood within the theme; unset = automatic
  ambience?: string | null  // uploaded audio to loop; unset = story default, 'none' = silence
}

export interface MadLibField {
  key: string
  label: string
  hint?: string  // Grammar hint (e.g., "verb, past tense")
}

export interface MadLibTemplate {
  prompt: string
  fields: MadLibField[]
}

export interface StorySettings {
  starting_hp: number
  non_linear: boolean
  vote_seconds?: number  // voting games: time to vote (0 = no limit)
}

export interface StorySound {
  ambience?: string | null  // default looping audio (an uploaded file name)
  stings: Record<string, string>  // moment type (hp_lost, victory…) -> uploaded file name
}

export interface AudioFile {
  name: string
  size: number
}

export interface Story {
  id: string
  title: string
  theme: ThemeName
  settings: StorySettings
  madlib_template: MadLibTemplate
  scenes: Scene[]
  opening_scene?: OpeningScene
  sound?: StorySound
  items?: ItemDef[]  // every item the story can give
  layout?: Record<string, { x: number; y: number }>  // editor only: node positions in the Flow view
}

export interface HistoryEntry {
  scene_id: string
  outcome: ChoiceKind
  choice_index: number
  item_name?: string
  item_icon?: string | null
  item_description?: string | null
  item_id?: string | null
  damage_amount: number
  decided_by?: string | null  // the player who made this choice (turn-taking games)
}

export interface Character {
  name: string
  description: string
  fields: Record<string, string>
}

// Who makes each choice: the storyteller, players in turn, or a player the storyteller picks
export type TurnMode = 'storyteller' | 'rotate' | 'pick' | 'vote'

/** Chosen in the Play dialog when a game starts */
export interface GameOptions {
  turnMode?: TurnMode
  /** Calm effects on every screen: no flashes, flicker or shake */
  noFlashing?: boolean
}

export interface PlayerRef {
  id: string
  name: string
}

// What everyone may know about a vote: who can vote, who has, and the time left (never what they chose)
export interface VoteStatus {
  open: boolean
  eligible: string[]
  voted: string[]
  ends_in: number | null  // seconds when sent; null = no time limit
}

// Storyteller only: votes per choice (keyed by visual index) and the leader(s); several = a tie
export interface VoteTally {
  counts: Record<string, number>
  leaders: number[]
}

export interface GameState {
  session_id: string
  story_id: string
  status: SessionStatus
  madlib_step: number
  madlib_answers: Record<string, string>
  current_scene_id: string
  hp: number
  level: number
  items: string[]
  history: HistoryEntry[]
  character?: Character
  outcome?: 'victory' | 'defeat'
  outcome_revealed: boolean
  choices_revealed: boolean
  shuffled_indices: number[]
  turn_mode: TurnMode
  players: PlayerRef[]
  decider_id?: string | null
  proposal?: number | null  // visual index the decider is leaning towards
  doors_dealt?: boolean  // non-linear stories: the storyteller has shown the doors on the phones
  door_proposal?: string | null  // non-linear stories: the door (scene id) the decider is leaning towards
  no_flashing: boolean  // the table asked for calm effects: every screen caps at "subtle"
  crest: number  // which of the hero's generated crests the table chose (drawn from the answers)
  emblem: Emblem | null  // or an emblem from the emblem service, which wins over crest
  crest_round: number | null  // which three crests the table is choosing from (null until the stage asks)
  emblem_options: Emblem[]  // those three from the emblem service; empty = the built-in crests of crest_round
  roll_offered: boolean  // the storyteller chose the digital d20 (otherwise: real dice)
  final_rolls: number[]  // the digital d20s rolled at the finale, in order
  roller_id: string | null  // who holds the digital d20 (games with names); null = the storyteller rolls
  last_roll_at: number | null  // epoch seconds of the last digital roll
}

// Resolved content sent from backend
export interface ResolvedContent {
  scene_text: string | null
  scene_text_pending?: boolean  // phones: the storyteller is still telling this scene (a player can read along)
  character_description?: string
  story_title: string
  theme: ThemeName
  visible_choices: string[]  // Choice display text in shuffled order, once revealed to players
  finale: boolean  // The final d20 roll is underway (until the outcome is revealed)
  final_roll?: FinalRoll  // at the finale, and after it
  max_hp: number
  decider: PlayerRef | null  // who makes this scene's choice, or picks the next door (null = the storyteller)
  doors?: Door[] | null  // non-linear stories, choosing the next door: the doors that can be opened
  vote: VoteStatus | null  // voting games, once the choices are dealt
  mood?: string | null  // the scene's chosen backdrop mood (null = automatic)
  mood_seed?: number  // stable per scene, picks the automatic mood
  scene_title?: string  // title of the current scene
  scene_subtitle?: string | null  // its display_name (the poetic door name), if any
  madlib_question?: string  // the question being asked during character creation
  madlib_progress?: { step: number; total: number }
  victory_text?: string
  defeat_text?: string
  items_found?: FoundItem[]  // the backpack, in the order found
  journey?: JourneyStep[]  // once the story is over: the path the table took
}

export interface JourneyStep {
  scene_title: string
  outcome: ChoiceKind
  item_name: string | null
  item_icon: string | null
}

export interface FinalRoll {
  rolls: number[]
  bonus: number  // one per item
  attempts: number  // one per level
  target: number  // roll + bonus must reach it
  offered: boolean  // the digital d20 is in play (otherwise: real dice)
  roller: PlayerRef | null  // the player holding it; null = the storyteller rolls
}

export interface FoundItem {
  name: string
  icon: string | null
  description?: string | null  // the story's flavour text, if it has any
  scene_title: string  // where it was found
}

// SSE payload from backend
export interface SSEStatePayload {
  type: 'state'
  state: GameState | null
  resolved: ResolvedContent | null
  player_count: number
  storyteller_connected: boolean
  players_online: string[]  // ids of named players with a live connection
  vote_tally?: VoteTally | null  // sent only to the storyteller
  path_progress?: PathProgress | null  // sent only to the storyteller, in branching stories
}

/** Branching stories (storyteller only): scenes played, and the fewest and most left, this one included */
export interface PathProgress {
  played: number
  to_go: [number, number]
}

export interface SSESessionEndedPayload {
  type: 'session_ended'
}

export type SSEPayload = SSEStatePayload | SSESessionEndedPayload

// API response types
export interface StorySummary {
  id: string
  title: string
  theme: ThemeName
  scene_count: number
}

// Something that would stop a story being played (an error), or only surprise (a warning), and where it is
export interface StoryProblem {
  message: string
  area: 'story' | 'characters' | 'opening' | 'scene' | 'items'
  scene_id: string | null
  field: string | null  // e.g. 'item_id', 'conditional_text', 'choices', 'next_scene_id', 'routes', 'next', 'requires'
  index: number | null  // which choice / condition / route / item
  severity: 'error' | 'warning'  // only errors stop a game starting
}

/** A crest from the emblem service (emblazon), SVG included */
export interface Emblem {
  theme: string
  input: string
  version: number
  description: string
  svg: string
}

/** A door the table can open next (non-linear stories) */
export interface Door {
  id: string
  title: string
  last: boolean  // the finale's door
  played: boolean  // opened already
  locked: boolean  // its conditions don't hold yet (Scene.requires)
  sealed: boolean  // the last door, while any other can still be opened
  open: boolean  // can be chosen now
}
