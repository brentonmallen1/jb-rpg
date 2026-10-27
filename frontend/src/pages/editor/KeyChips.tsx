import type { RefObject } from 'react'
import { insertAtCursor } from '../../lib/insertAtCursor'

interface KeyChipsProps {
  label: string
  tokens: { token: string; title?: string; text?: string }[]
  /** The text field the author was last typing in */
  target: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
}

/** Click a chip to insert its token where the author was typing. */
export function KeyChips({ label, tokens, target }: KeyChipsProps) {
  if (tokens.length === 0) return null
  return (
    <div className="ed-chips" role="toolbar" aria-label={label}>
      <span className="ed-chips__label">{label}</span>
      {tokens.map(t => (
        <button
          key={t.token}
          type="button"
          className="ed-chip"
          title={t.title}
          // Keep focus (and the cursor) in the field being edited
          onMouseDown={e => e.preventDefault()}
          onClick={() => target.current?.isConnected && insertAtCursor(target.current, t.token)}
        >
          {t.text ?? t.token}
        </button>
      ))}
    </div>
  )
}
