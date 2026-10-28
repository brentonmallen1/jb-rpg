import { useEffect, useRef, useState } from 'react'
import type { EffectsLevel } from '../../hooks/useEffectsLevel'
import type { TextSize } from '../../hooks/useTextSize'
import { GearIcon } from '../../components/Icons'

const LEVELS: { level: EffectsLevel; name: string; description: string }[] = [
  { level: 'full', name: 'Full', description: 'Flashes, shaking and flickering text when things happen.' },
  { level: 'subtle', name: 'Gentle', description: 'Slow fades only. Nothing flashes or moves suddenly.' },
  { level: 'off', name: 'Off', description: 'Just the words. No backgrounds or effects.' },
]

const SIZES: { size: TextSize; name: string }[] = [
  { size: 'small', name: 'Small' },
  { size: 'default', name: 'Standard' },
  { size: 'large', name: 'Large' },
  { size: 'largest', name: 'Largest' },
]

interface PhoneSettingsProps {
  /** This phone's own effects choice */
  effects: EffectsLevel
  /** The table asked for no flashing: Full is unavailable */
  tableCalm: boolean
  onEffectsChange: (level: EffectsLevel) => void
  textSize: TextSize
  onTextSizeChange: (size: TextSize) => void
  dark: boolean
  onToggleDark: () => void
}

/** The phone's settings: a gear that pulls down text size, the effects switch and light/dark. */
export function PhoneSettings({ effects, tableCalm, onEffectsChange, textSize, onTextSizeChange, dark, onToggleDark }: PhoneSettingsProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const shown = tableCalm && effects === 'full' ? 'subtle' : effects
  const current = LEVELS.find(l => l.level === shown)!

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
    <div ref={root}>
      <button type="button" className="phone__tool" aria-label="Settings" aria-expanded={open} onClick={() => setOpen(!open)}>
        <GearIcon />
      </button>

      {open && (
        <div className="settings" role="group" aria-label="Settings">
          <fieldset className="settings__row settings__row--size">
            <legend>Text size</legend>
            <div className="segmented segmented--sizes">
              {SIZES.map((s, i) => (
                <label key={s.size} className={`segmented__option ${textSize === s.size ? 'is-selected' : ''}`} title={s.name}>
                  <input
                    type="radio"
                    name="text-size"
                    value={s.size}
                    aria-label={s.name}
                    checked={textSize === s.size}
                    onChange={() => onTextSizeChange(s.size)}
                  />
                  <span className="segmented__glyph" style={{ fontSize: `${0.8 + i * 0.22}em` }} aria-hidden="true">A</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="settings__row settings__row--effects">
            <legend>Effects</legend>
            <div className="segmented">
              {LEVELS.map(l => {
                const locked = tableCalm && l.level === 'full'
                return (
                  <label key={l.level} className={`segmented__option ${shown === l.level ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}`}>
                    <input
                      type="radio"
                      name="effects-level"
                      value={l.level}
                      checked={shown === l.level}
                      disabled={locked}
                      onChange={() => onEffectsChange(l.level)}
                    />
                    {l.name}
                  </label>
                )
              })}
            </div>
            <p className="settings__hint">
              {current.description}
              {tableCalm && ' The table asked for no flashing.'}
            </p>
          </fieldset>

          <div className="settings__row settings__row--inline">
            <span id="dark-mode-label">Dark mode</span>
            <button type="button" role="switch" aria-checked={dark} aria-labelledby="dark-mode-label" className="switch" onClick={onToggleDark}>
              <span className="switch__thumb" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
