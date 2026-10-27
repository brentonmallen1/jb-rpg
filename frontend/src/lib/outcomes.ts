import type { Choice } from '../types'
import { GemIcon, LevelIcon, WoundIcon } from '../components/Icons'

/** Short storyteller-facing label for what a choice does. */
export function outcomeLabel(choice: Pick<Choice, 'kind' | 'item_name'>): string {
  switch (choice.kind) {
    case 'damage': return '−1 HP'
    case 'item': return choice.item_name || 'Item'
    case 'level': return 'Level Up'
  }
}

/** Which icon goes with a choice outcome (never colour alone). */
export const OUTCOME_ICON = { damage: WoundIcon, item: GemIcon, level: LevelIcon } as const
