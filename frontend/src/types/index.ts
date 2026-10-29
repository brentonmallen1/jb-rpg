// Theme names matching backend ThemeName enum: the single list for the frontend
export const THEMES = ['cyberpunk', 'fantasy', 'deep_space', 'modern', 'horror', 'insanity'] as const
export type ThemeName = typeof THEMES[number]

// Session status matching backend SessionStatus enum
export type SessionStatus = 'madlib_in_progress' | 'character_reveal' | 'opening_scene_active' | 'running' | 'awaiting_scene_selection' | 'game_over'

// Choice outcome types
export type ChoiceKind = 'damage' | 'item' | 'level'

// Condition types for conditional text
export type ConditionType = 'hp' | 'items' | 'level' | 'scene_outcome'
export type ConditionOp = 'lte' | 'gte' | 'eq'

export interface Condition {
  type: ConditionType
  op?: ConditionOp
  value?: number
  scene_id?: string
  outcome?: ChoiceKind
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

export interface Choice {
  kind: ChoiceKind
  display_text: string  // What players see when choosing
  result_text: string   // What storyteller reads after choice is made
  amount: number
  item_name?: string
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
  item_texts?: Record<string, { victory?: string; defeat?: string }>  // Item-conditional text blocks for finale
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
}

export interface HistoryEntry {
  scene_id: string
  outcome: ChoiceKind
  choice_index: number
  item_name?: string
  damage_amount: number
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
  no_flashing: boolean  // the table asked for calm effects: every screen caps at "subtle"
}

// Resolved content sent from backend
export interface ResolvedContent {
  scene_text: string | null  // null on phones until the choices are dealt
  scene_text_pending?: boolean  // phones: the storyteller is telling this scene; its words come with the choices
  character_description?: string
  story_title: string
  theme: ThemeName
  visible_choices: string[]  // Choice display text in shuffled order, once revealed to players
  finale: boolean  // The final d20 roll is underway
  max_hp: number
  decider: PlayerRef | null  // who makes this scene's choice (null = the storyteller)
  vote: VoteStatus | null  // voting games, once the choices are dealt
  mood?: string | null  // the scene's chosen backdrop mood (null = automatic)
  mood_seed?: number  // stable per scene, picks the automatic mood
  scene_title?: string  // title of the current scene
  scene_subtitle?: string | null  // its display_name (the poetic door name), if any
  madlib_question?: string  // the question being asked during character creation
  madlib_progress?: { step: number; total: number }
  victory_text?: string
  defeat_text?: string
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

// Something that would stop a story being played, and where it is
export interface StoryProblem {
  message: string
  area: 'story' | 'characters' | 'opening' | 'scene'
  scene_id: string | null
  field: string | null  // e.g. 'item_name', 'conditional_text', 'choices', 'target_scene_id'
  index: number | null  // which choice / condition
}
