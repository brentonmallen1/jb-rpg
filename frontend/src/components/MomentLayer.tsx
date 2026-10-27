import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MOMENT_DURATION, momentCopy } from '../lib/moments'
import type { QueuedMoment } from '../hooks/useMoments'
import type { EffectsLevel } from '../hooks/useEffectsLevel'
import type { ThemeName } from '../types'
import '../styles/moments.css'

interface MomentLayerProps {
  moment: QueuedMoment | null
  theme: ThemeName
  level: EffectsLevel
  onDone: (id: number) => void
}

/** Plays one moment over the page: a themed overlay, plus shake and vibration at full effects. */
export function MomentLayer({ moment, theme, level, onDone }: MomentLayerProps) {
  useEffect(() => {
    if (!moment) return
    if (level === 'off') {
      onDone(moment.id)
      return
    }

    const full = level === 'full'
    if (full && moment.type === 'hp_lost') {
      navigator.vibrate?.([120, 60, 180])
      document.documentElement.classList.add('moment-shake')
    }
    const unshake = window.setTimeout(() => document.documentElement.classList.remove('moment-shake'), 500)
    const finish = window.setTimeout(
      () => onDone(moment.id),
      MOMENT_DURATION[moment.type] * (full ? 1 : 0.7),
    )
    return () => {
      clearTimeout(unshake)
      clearTimeout(finish)
      document.documentElement.classList.remove('moment-shake')
    }
  }, [moment, level, onDone])

  if (!moment || level === 'off') return null

  const title = momentCopy(theme, moment.type)
  const detail =
    moment.type === 'item_gained' ? moment.item :
    moment.type === 'character_revealed' ? moment.name :
    moment.type === 'level_up' ? `Level ${moment.level}` :
    moment.type === 'hp_lost' ? (moment.hp === 1 ? 'One left' : moment.hp === 0 ? '' : `${moment.hp} left`) :
    ''

  // Outside #root, so shaking the app doesn't move the overlay
  return createPortal(
    <div
      key={moment.id}
      className={`moment moment--${moment.type} moment--${level}`}
      style={{ '--moment-duration': `${MOMENT_DURATION[moment.type] * (level === 'full' ? 1 : 0.7)}ms` } as React.CSSProperties}
      aria-hidden={!title}
    >
      {/* Dims the page under a title so it reads cleanly over any screen */}
      {title && moment.type !== 'item_gained' && <div className="moment__scrim" />}
      <div className="moment__backdrop" />
      {title && (
        <div className="moment__card" role="status" aria-live="polite">
          <div className="moment__title">{title}</div>
          {detail && <div className="moment__detail">{detail}</div>}
        </div>
      )}
    </div>,
    document.body,
  )
}

/** A heartbeat at the screen edges while the party is down to its last life. */
export function CriticalPulse({ active, level }: { active: boolean; level: EffectsLevel }) {
  if (!active || level === 'off') return null
  return <div className={`critical-pulse critical-pulse--${level}`} aria-hidden="true" />
}
