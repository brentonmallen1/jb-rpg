import type { GameState, ResolvedContent, ThemeName } from '../types'

/**
 * Moments are the dramatic beats of a game, derived by comparing consecutive SSE
 * states. Every client gets the same stream, so every screen plays them in sync.
 */
export type Moment =
  | { type: 'character_revealed'; name: string }
  | { type: 'hp_lost'; hp: number }
  | { type: 'item_gained'; item: string; where?: string; icon?: string | null }
  | { type: 'level_up'; level: number }
  | { type: 'scene_changed' }
  | { type: 'choices_revealed' }
  | { type: 'decider'; playerId: string; name: string }
  | { type: 'finale' }
  | { type: 'dice_rolled'; roll: number; bonus: number; target: number; attemptsLeft: number }
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
    next.items.slice(prev.items.length).forEach((item, i) => {
      const found = nextResolved?.items_found?.[prev.items.length + i]
      moments.push({ type: 'item_gained', item, where: found?.scene_title, icon: found?.icon })
    })
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

  // The turn passes to a player (taking turns, or the storyteller picked someone)
  const decider = nextResolved?.decider
  if (decider && decider.id !== prevResolved?.decider?.id && !undo && next.status === 'running') {
    moments.push({ type: 'decider', playerId: decider.id, name: decider.name })
  }

  if (!prev.choices_revealed && next.choices_revealed) moments.push({ type: 'choices_revealed' })

  // The digital d20 lands on every screen at once
  const rolls = next.final_rolls ?? []
  rolls.slice((prev.final_rolls ?? []).length).forEach((roll, i) => {
    const made = (prev.final_rolls ?? []).length + i + 1
    moments.push({ type: 'dice_rolled', roll, bonus: next.items.length, target: nextResolved?.final_roll?.target ?? 20, attemptsLeft: next.level - made })
  })

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
  item_gained: 3400,
  level_up: 1800,
  scene_changed: 1100,
  choices_revealed: 600,
  decider: 1900,
  finale: 3200,
  dice_rolled: 3600,
  victory: 4000,
  defeat: 4000,
}

type MomentCopy = Partial<Record<MomentType, string>>

const DEFAULT_COPY: Record<MomentType, string> = {
  character_revealed: 'A hero is born',
  hp_lost: 'You took a hit',
  item_gained: 'You found something',
  level_up: 'You grow stronger',
  scene_changed: '',
  choices_revealed: '',
  decider: 'Your call',
  finale: 'The final roll',
  dice_rolled: 'The die is cast',
  victory: 'Victory',
  defeat: 'Defeat',
}

// Each theme names its own beats
const THEME_COPY: Record<ThemeName, MomentCopy> = {
  fantasy: { hp_lost: 'A candle gutters out', item_gained: 'Added to your satchel', level_up: 'Your legend grows', finale: 'The final trial' },
  cyberpunk: { hp_lost: 'Integrity breach', item_gained: 'Asset acquired', level_up: 'Clearance raised', finale: '// Final sequence', dice_rolled: '// Roll resolved' },
  deep_space: { hp_lost: 'Hull breach', item_gained: 'Salvage recovered', level_up: 'Promoted', finale: 'Final approach', dice_rolled: 'Probability resolved' },
  horror: { hp_lost: 'Something takes hold', item_gained: 'Something to hold on to', level_up: 'You steel yourself', finale: 'The last door', dice_rolled: 'Fate answers', defeat: 'Taken', victory: 'You survived' },
  insanity: { hp_lost: 'Your grip slips', item_gained: 'You keep it close', level_up: 'Your mind sharpens', finale: 'It sees you now', dice_rolled: 'The bones fall', defeat: 'Lost to the dark', victory: 'You remember who you are' },
  modern: { item_gained: 'Added to your bag', level_up: 'Level up' },
}

export function momentCopy(theme: ThemeName, type: MomentType): string {
  return THEME_COPY[theme][type] ?? DEFAULT_COPY[type]
}
