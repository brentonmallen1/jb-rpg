import type { GameState, ResolvedContent, ThemeName } from '../types'

/**
 * Moments are the dramatic beats of a game, derived by comparing consecutive SSE
 * states. Every client gets the same stream, so every screen plays them in sync.
 */
export type Moment =
  | { type: 'character_revealed'; name: string }
  | { type: 'hp_lost'; hp: number }
  | { type: 'item_gained'; item: string }
  | { type: 'level_up'; level: number }
  | { type: 'scene_changed' }
  | { type: 'choices_revealed' }
  | { type: 'finale' }
  | { type: 'victory' }
  | { type: 'defeat' }

export type MomentType = Moment['type']

/**
 * What just happened between two states, in the order it should be played.
 * Undo (Back) and reconnects produce no moments: drama only plays forward.
 */
export function diffMoments(
  prev: GameState | null,
  next: GameState | null,
  prevResolved: ResolvedContent | null,
  nextResolved: ResolvedContent | null,
): Moment[] {
  if (!prev || !next || prev.session_id !== next.session_id) return []
  const undo = next.history.length < prev.history.length
  const moments: Moment[] = []

  if (!prev.character && next.character) {
    moments.push({ type: 'character_revealed', name: next.character.name })
  }

  if (!undo) {
    if (next.hp < prev.hp) moments.push({ type: 'hp_lost', hp: next.hp })
    for (const item of next.items.slice(prev.items.length)) moments.push({ type: 'item_gained', item })
    if (next.level > prev.level) moments.push({ type: 'level_up', level: next.level })
  }

  const enteredScene = next.status === 'running' &&
    (next.current_scene_id !== prev.current_scene_id || prev.status !== 'running')
  const enteredFinale = !prevResolved?.finale && !!nextResolved?.finale
  if (enteredFinale && !undo) {
    moments.push({ type: 'finale' })
  } else if (enteredScene && !undo) {
    moments.push({ type: 'scene_changed' })
  }

  if (!prev.choices_revealed && next.choices_revealed) moments.push({ type: 'choices_revealed' })

  const wasRevealed = prev.outcome_revealed && prev.outcome
  if (!wasRevealed && next.outcome_revealed && next.outcome) {
    moments.push({ type: next.outcome })
  }

  return moments
}

/** How long each moment holds the stage (ms). Played one after another. */
export const MOMENT_DURATION: Record<MomentType, number> = {
  character_revealed: 2400,
  hp_lost: 1400,
  item_gained: 1800,
  level_up: 1800,
  scene_changed: 1100,
  choices_revealed: 600,
  finale: 3200,
  victory: 4000,
  defeat: 4000,
}

type MomentCopy = Partial<Record<MomentType, string>>

const DEFAULT_COPY: Record<MomentType, string> = {
  character_revealed: 'A hero is born',
  hp_lost: 'You’ve been hurt',
  item_gained: 'Item found',
  level_up: 'Level up',
  scene_changed: '',
  choices_revealed: '',
  finale: 'The final roll',
  victory: 'Victory',
  defeat: 'Defeat',
}

// Each theme names its own beats
const THEME_COPY: Record<ThemeName, MomentCopy> = {
  fantasy: { hp_lost: 'A candle gutters out', finale: 'The final trial', item_gained: 'Added to your satchel' },
  cyberpunk: { hp_lost: 'Integrity breach', finale: '// Final sequence', item_gained: 'Asset acquired', level_up: 'Clearance raised' },
  deep_space: { hp_lost: 'Hull breach', finale: 'Final approach', item_gained: 'Salvage recovered', level_up: 'Rank up' },
  horror: { hp_lost: 'Something takes hold', finale: 'The last door', defeat: 'Taken', victory: 'You survived' },
  insanity: { hp_lost: 'Your grip slips', finale: 'It sees you now', defeat: 'Lost to the dark', victory: 'You remember who you are' },
  modern: {},
}

export function momentCopy(theme: ThemeName, type: MomentType): string {
  return THEME_COPY[theme][type] ?? DEFAULT_COPY[type]
}
