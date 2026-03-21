// Theme names matching backend ThemeName enum
export type ThemeName = 'cyberpunk' | 'fantasy' | 'deep_space' | 'modern' | 'horror' | 'insanity'

// Session status matching backend SessionStatus enum
export type SessionStatus = 'madlib_in_progress' | 'opening_scene_active' | 'running' | 'awaiting_scene_selection' | 'game_over'

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
  text: string
  amount: number
  item_name?: string
}

export interface Scene {
  id: string
  title: string
  base_text: string
  choices: Choice[]
  conditional_text: ConditionalText[]
}

export interface MadLibField {
  key: string
  label: string
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
  choices_revealed: boolean
  shuffled_choices: string[]
}

// Resolved content sent from backend
export interface ResolvedContent {
  scene_text: string
  character_description?: string
  choices?: Choice[]  // Optional - backend doesn't send this, choices come from story.scenes
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
