import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MOMENT_DURATION, momentCopy } from '../lib/moments'
import type { QueuedMoment } from '../hooks/useMoments'
import type { EffectsLevel } from '../hooks/useEffectsLevel'
import type { ThemeName } from '../types'
import { ItemIcon } from './ItemIcon'
import '../styles/moments.css'

interface MomentLayerProps {
  moment: QueuedMoment | null
  theme: ThemeName
  level: EffectsLevel
  onDone: (id: number) => void
  /** The named player watching (on their phone), so their own turn reads "Your call" */
  viewerId?: string | null
}

/** Plays one moment over the page: a themed overlay, plus shake and vibration at full effects. */
export function MomentLayer({ moment, theme, level, onDone, viewerId }: MomentLayerProps) {
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

  const mine = moment.type === 'decider' && moment.playerId === viewerId
  const title = moment.type === 'decider' ? (mine ? momentCopy(theme, 'decider') : moment.name) : momentCopy(theme, moment.type)
  const detail =
    moment.type === 'decider' ? (mine ? 'The choice is yours to make' : 'makes this choice') :
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
      {title && <div className="moment__scrim" />}
      <div className="moment__backdrop" />
      {moment.type === 'dice_rolled' ? (
        <DiceCard label={title} roll={moment.roll} bonus={moment.bonus} target={moment.target} attemptsLeft={moment.attemptsLeft} />
      ) : moment.type === 'item_gained' ? (
        <ItemCard label={title} item={moment.item} where={moment.where} icon={moment.icon} theme={theme} />
      ) : title && (
        <div className="moment__card" role="status" aria-live="polite">
          <div className="moment__title">{title}</div>
          {detail && <div className="moment__detail">{detail}</div>}
        </div>
      )}
    </div>,
    document.body,
  )
}

/**
 * An item found: a card lands face down, turns itself over (on every screen at once),
 * then tucks away toward the backpack.
 */
function ItemCard({ label, item, where, icon, theme }: { label: string; item: string; where?: string; icon?: string | null; theme: ThemeName }) {
  return (
    <div className="item-card" role="status" aria-live="polite">
      {/* What the choice won, above the card */}
      <span className="item-card__heading">{label}</span>
      <div className="item-card__inner">
        <div className="item-card__back" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M50 20l6 22 22 8-22 8-6 22-6-22-22-8 22-8z" fill="currentColor" />
          </svg>
        </div>
        <div className="item-card__face">
          <span className="item-card__icon" aria-hidden="true"><ItemIcon name={item} icon={icon} theme={theme} size={72} framed /></span>
          <span className="item-card__name">{item}</span>
          {where && <span className="item-card__where">Found in {where}</span>}
        </div>
      </div>
    </div>
  )
}

/** The digital d20: it tumbles, lands on its number, and the bonus is added on every screen at once. */
function DiceCard({ label, roll, bonus, target, attemptsLeft }: { label: string; roll: number; bonus: number; target: number; attemptsLeft: number }) {
  const total = roll + bonus
  const enough = total >= target
  const verdict = enough ? 'Enough' : attemptsLeft > 0 ? `Short · ${attemptsLeft === 1 ? 'one more try' : `${attemptsLeft} more tries`}` : 'Short'
  return (
    <div className={`dice-card ${enough ? 'dice-card--enough' : ''}`} role="status" aria-live="polite">
      <span className="dice-card__label">{label}</span>
      <div className="dice-card__die" aria-hidden="true">
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))" stroke="var(--accent)" strokeWidth="2" />
          <polygon points="50,24 72,62 28,62" fill="none" stroke="var(--accent)" strokeWidth="1.2" opacity=".7" />
          <path d="M50 4L50 24M90 27L72 62M90 73L72 62M50 96L72 62M50 96L28 62M10 73L28 62M10 27L28 62M10 27L50 24M90 27L50 24" stroke="var(--accent)" strokeWidth="1" opacity=".45" />
        </svg>
        <span className="dice-card__number">{roll}</span>
      </div>
      <span className="dice-card__sum">{bonus > 0 ? `${roll} + ${bonus} = ${total}` : `${total}`}</span>
      <span className="dice-card__verdict">{verdict}</span>
    </div>
  )
}

/** A heartbeat at the screen edges while the party is down to its last life. */
export function CriticalPulse({ active, level }: { active: boolean; level: EffectsLevel }) {
  if (!active || level === 'off') return null
  return <div className={`critical-pulse critical-pulse--${level}`} aria-hidden="true" />
}
