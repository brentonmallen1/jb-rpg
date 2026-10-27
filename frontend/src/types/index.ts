// Theme names matching backend ThemeName enum
export type ThemeName = 'cyberpunk' | 'fantasy' | 'deep_space' | 'modern' | 'horror' | 'insanity'

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
}

export interface Story {
  id: string
  title: string
  theme: ThemeName
  settings: StorySettings
  madlib_template: MadLibTemplate
  scenes: Scene[]
  opening_scene?: OpeningScene
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
}

// Resolved content sent from backend
export interface ResolvedContent {
  scene_text: string
  character_description?: string
  theme: ThemeName
  visible_choices: string[]  // Choice display text in shuffled order, once revealed to players
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
