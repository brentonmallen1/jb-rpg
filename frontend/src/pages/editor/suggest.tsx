import { createContext, useContext, useState, type KeyboardEvent, type RefObject } from 'react'

/** A placeholder the author can type: "{name}", "{item_text:Climbing Rope}" */
export interface Suggestion {
  token: string
  hint?: string
}

/** What "{" offers in the editor's text fields: the hero's answers, and in finale texts the items too. */
export const SuggestionsContext = createContext<Suggestion[]>([])

type Field = HTMLInputElement | HTMLTextAreaElement

/** The "{…" being typed just before the cursor, if any. */
function typedToken(el: Field): { start: number; query: string } | null {
  const caret = el.selectionStart ?? 0
  if (caret !== el.selectionEnd) return null
  const before = el.value.slice(0, caret)
  const match = before.match(/\{([\w\s:'-]{0,40})$/)
  return match ? { start: caret - match[0].length, query: match[1].toLowerCase() } : null
}

/** Replace what's typed from "{" to the cursor with the token, through the field's own onChange. */
function insertToken(el: Field, start: number, token: string) {
  const caret = el.selectionStart ?? start
  const next = el.value.slice(0, start) + token + el.value.slice(caret)
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  requestAnimationFrame(() => el.setSelectionRange(start + token.length, start + token.length))
}

/**
 * Typing "{" in a field offers the placeholders it can hold. Arrows choose, Enter or Tab inserts,
 * Escape (or typing on) leaves the text as it is.
 */
export function usePlaceholderSuggest(ref: RefObject<Field | null>) {
  const suggestions = useContext(SuggestionsContext)
  const [typed, setTyped] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)

  const matches = typed ? suggestions.filter(s => s.token.toLowerCase().includes(typed.query)) : []
  const open = matches.length > 0

  function refresh() {
    const el = ref.current
    const next = el && suggestions.length ? typedToken(el) : null
    setTyped(prev => (prev?.start === next?.start && prev?.query === next?.query ? prev : next))
    if (next?.query !== typed?.query) setActive(0)
  }

  function pick(index: number) {
    const el = ref.current
    if (!el || !typed) return
    insertToken(el, typed.start, matches[index].token)
    setTyped(null)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setTyped(null)
    }
  }

  const popup = open ? (
    <ul className="suggest" role="listbox" aria-label="Placeholders" onMouseDown={e => e.preventDefault()}>
      {matches.map((s, i) => (
        <li
          key={s.token}
          role="option"
          aria-selected={i === active}
          className={i === active ? 'is-active' : ''}
          onMouseEnter={() => setActive(i)}
          onClick={() => pick(i)}
        >
          <code>{s.token}</code>
          {s.hint && <span className="suggest__hint">{s.hint}</span>}
        </li>
      ))}
    </ul>
  ) : null

  return {
    popup,
    handlers: {
      onKeyDown,
      onKeyUp: (e: KeyboardEvent) => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) refresh() },
      onClick: refresh,
      onBlur: () => setTyped(null),
    },
  }
}
