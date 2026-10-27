import { useEffect, useRef, useState } from 'react'
import type { EffectsLevel } from '../../hooks/useEffectsLevel'
import { SparkIcon } from '../../components/Icons'

const OPTIONS: { level: EffectsLevel; name: string; description: string }[] = [
  { level: 'full', name: 'Full', description: 'Flashes, shaking and flickering text when things happen.' },
  { level: 'subtle', name: 'Gentle', description: 'Slow fades only. Nothing flashes or moves suddenly.' },
  { level: 'off', name: 'Off', description: 'Just the words. No backgrounds or effects.' },
]

const NAME: Record<EffectsLevel, string> = { full: 'Full', subtle: 'Gentle', off: 'Off' }

interface EffectsMenuProps {
  /** This phone's own choice */
  chosen: EffectsLevel
  /** The table asked for no flashing: Full is unavailable */
  tableCalm: boolean
  onChange: (level: EffectsLevel) => void
}

/** The phone's effects setting: a labelled button that opens the three choices, explained. */
export function EffectsMenu({ chosen, tableCalm, onChange }: EffectsMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const shown = tableCalm && chosen === 'full' ? 'subtle' : chosen

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="effects" ref={root}>
      <button
        type="button"
        className="phone__tool effects__button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
      >
        <SparkIcon style={{ opacity: shown === 'off' ? 0.4 : shown === 'subtle' ? 0.7 : 1 }} />
        <span>Effects: {NAME[shown]}</span>
      </button>

      {open && (
        <fieldset className="effects__panel">
          <legend>Effects on this phone</legend>
          {OPTIONS.map(o => {
            const locked = tableCalm && o.level === 'full'
            return (
              <label key={o.level} className={`effects__option ${shown === o.level ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}`}>
                <input
                  type="radio"
                  name="effects-level"
                  value={o.level}
                  checked={shown === o.level}
                  disabled={locked}
                  readOnly
                  onClick={() => { onChange(o.level); setOpen(false) }}
                />
                <span>
                  <strong>{o.name}</strong>
                  <span className="effects__desc">{locked ? 'The table asked for no flashing.' : o.description}</span>
                </span>
              </label>
            )
          })}
        </fieldset>
      )}
    </div>
  )
}
