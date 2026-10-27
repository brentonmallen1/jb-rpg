import type { Choice } from '../types'

/** Short storyteller-facing label for what a choice does. */
export function outcomeLabel(choice: Pick<Choice, 'kind' | 'item_name'>): string {
  switch (choice.kind) {
    case 'damage': return '−1 HP'
    case 'item': return choice.item_name || 'Item'
    case 'level': return 'Level Up'
  }
}
