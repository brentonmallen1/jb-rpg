import { useId, useRef, useState, type ReactNode } from 'react'

export interface ComboOption {
  value: string
  label: string
  hint?: ReactNode  // a second, quieter line
  lead?: ReactNode  // an icon before the label
  group?: string  // options are shown under their group's heading, in order
}

interface ComboboxProps {
  id?: string
  value: string | null | undefined  // the chosen option's value
  options: ComboOption[]
  onChange: (value: string) => void
  /** Offer "New …" for text that matches no option */
  onCreate?: (text: string) => void
  createLabel?: (text: string) => string
  placeholder?: string
  'aria-label'?: string
  invalid?: boolean
  className?: string
}

/**
 * One picker for every reference the editor asks for: an item, a scene to lead to, a scene or item
 * a condition checks. Type to search; arrows and Enter to pick; Escape to leave it as it was.
 */
export function Combobox({ id, value, options, onChange, onCreate, createLabel, placeholder, invalid, className, ...rest }: ComboboxProps) {
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const chosen = options.find(o => o.value === value)
  const q = query.trim().toLowerCase()
  const matches = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  const canCreate = !!onCreate && !!q && !options.some(o => o.label.toLowerCase() === q)
  const count = matches.length + (canCreate ? 1 : 0)

  function close() {
    setOpen(false)
    setQuery('')
  }

  function pick(index: number) {
    if (index < matches.length) onChange(matches[index].value)
    else if (canCreate) onCreate!(query.trim())
    close()
    input.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      setActive(a => (count ? (a + (e.key === 'ArrowDown' ? 1 : count - 1)) % count : 0))
    } else if (e.key === 'Enter' && open) {
      e.preventDefault()
      if (count) pick(active)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  return (
    <div className={`combo ${className ?? ''}`}>
      <input
        ref={input}
        id={id}
        className={`ed-input combo__input ${invalid ? 'combo__input--invalid' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && count ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        aria-label={rest['aria-label']}
        value={open ? query : chosen?.label ?? ''}
        placeholder={open ? chosen?.label || placeholder : placeholder}
        onFocus={() => {
          setOpen(true)
          setActive(Math.max(0, options.findIndex(o => o.value === value)))
        }}
        onBlur={close}
        onChange={e => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
      />
      {open && count > 0 && (
        <ul className="combo__list" id={listId} role="listbox" onMouseDown={e => e.preventDefault()}>
          {matches.map((o, i) => {
            const heading = o.group && o.group !== matches[i - 1]?.group ? o.group : null
            return (
              <li key={o.value} role="presentation">
                {heading && <span className="combo__group" role="presentation">{heading}</span>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  className={`combo__option ${i === active ? 'is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                >
                  {o.lead && <span className="combo__lead">{o.lead}</span>}
                  <span className="combo__text">
                    <span>{highlight(o.label, q)}</span>
                    {o.hint && <span className="combo__hint">{o.hint}</span>}
                  </span>
                </div>
              </li>
            )
          })}
          {canCreate && (
            <li role="presentation">
              <div
                id={`${listId}-${matches.length}`}
                role="option"
                aria-selected={false}
                className={`combo__option combo__option--create ${active === matches.length ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(matches.length)}
                onClick={() => pick(matches.length)}
              >
                <span className="combo__lead combo__lead--plus" aria-hidden="true">+</span>
                <span className="combo__text">{createLabel ? createLabel(query.trim()) : `New “${query.trim()}”`}</span>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function highlight(label: string, q: string): ReactNode {
  const at = q ? label.toLowerCase().indexOf(q) : -1
  if (at < 0) return label
  return <>{label.slice(0, at)}<mark>{label.slice(at, at + q.length)}</mark>{label.slice(at + q.length)}</>
}
