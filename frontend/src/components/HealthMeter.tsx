import type { ThemeName } from '../types'
import { HEALTH_LABEL } from '../lib/themes'
import '../styles/health.css'

interface HealthMeterProps {
  hp: number
  max: number
  theme: ThemeName
  size?: number
}

/** The party's health, drawn in the theme's own iconography (candles, eyes, cells...). */
export function HealthMeter({ hp, max, theme, size = 28 }: HealthMeterProps) {
  const label = HEALTH_LABEL[theme]
  return (
    <div className={`health health--${theme}`} role="img" aria-label={`${label}: ${hp} of ${max}`} style={{ '--hm-size': `${size}px` } as React.CSSProperties}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`health__unit ${i < hp ? 'is-full' : 'is-lost'}`} style={{ '--i': i } as React.CSSProperties}>
          <HealthIcon theme={theme} full={i < hp} />
        </span>
      ))}
    </div>
  )
}

function HealthIcon({ theme, full }: { theme: ThemeName; full: boolean }) {
  switch (theme) {
    case 'fantasy':
      return full ? (
        <svg viewBox="0 0 26 54" aria-hidden="true">
          <g className="hm-flame">
            <path d="M13 2c4 7 6 10 6 14a6 6 0 0 1-12 0c0-4 2-7 6-14z" fill="var(--accent)" />
            <path d="M13 9c2 4 3 6 3 8a3 3 0 0 1-6 0c0-2 1-4 3-8z" fill="color-mix(in srgb, var(--accent) 30%, white)" />
          </g>
          <rect x="7" y="24" width="12" height="30" rx="2" fill="color-mix(in srgb, var(--text-primary) 90%, var(--accent))" />
        </svg>
      ) : (
        <svg viewBox="0 0 26 54" aria-hidden="true">
          <path className="hm-smoke" d="M13 22c-2-3 1-5 0-8" fill="none" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="7" y="30" width="12" height="24" rx="2" fill="color-mix(in srgb, var(--text-secondary) 55%, var(--bg-primary))" />
        </svg>
      )
    case 'horror':
      return full ? (
        <svg viewBox="0 0 40 24" aria-hidden="true">
          <g className="hm-blink">
            <path d="M2 12C8 3 32 3 38 12 32 21 8 21 2 12z" fill="none" stroke="var(--text-primary)" strokeWidth="1.5" />
            <circle cx="20" cy="12" r="5" fill="var(--accent)" />
            <circle cx="20" cy="12" r="2" fill="var(--bg-primary)" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 40 24" aria-hidden="true">
          <path d="M2 12C8 18 32 18 38 12" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
          <path className="hm-stitch" d="M8 13l-1 5M14 15l-.5 5M20 15.5v5M26 15l.5 5M32 13l1 5" stroke="color-mix(in srgb, var(--accent) 60%, var(--text-secondary))" strokeWidth="1.4" />
        </svg>
      )
    case 'cyberpunk':
      return full ? (
        <svg viewBox="0 0 28 32" aria-hidden="true">
          <polygon className="hm-cell" points="14,2 26,9 26,23 14,30 2,23 2,9" fill="color-mix(in srgb, var(--accent) 85%, transparent)" stroke="var(--accent)" strokeWidth="1.5" />
          <polygon points="14,9 20,12.5 20,19.5 14,23 8,19.5 8,12.5" fill="color-mix(in srgb, var(--accent) 40%, white)" />
        </svg>
      ) : (
        <svg viewBox="0 0 28 32" aria-hidden="true">
          <polygon points="14,2 26,9 26,23 14,30 2,23 2,9" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeDasharray="3 2" />
          <path d="M9 8l5 8-3 3 6 7" fill="none" stroke="var(--danger)" strokeWidth="1.4" />
        </svg>
      )
    case 'deep_space':
      return full ? (
        <svg viewBox="0 0 28 32" aria-hidden="true">
          <path className="hm-shield" d="M14 2l11 4v9c0 8-5 13-11 15C8 28 3 23 3 15V6z" fill="color-mix(in srgb, var(--accent) 80%, transparent)" stroke="var(--accent)" strokeWidth="1.4" />
          <path d="M14 7v18M8 12h12" stroke="color-mix(in srgb, var(--bg-primary) 60%, transparent)" strokeWidth="1.2" />
        </svg>
      ) : (
        <svg viewBox="0 0 28 32" aria-hidden="true">
          <path d="M14 2l11 4v9c0 8-5 13-11 15C8 28 3 23 3 15V6z" fill="none" stroke="var(--text-secondary)" strokeWidth="1.4" />
          <path d="M16 3l-4 9 5 3-5 13" fill="none" stroke="var(--danger)" strokeWidth="1.3" />
        </svg>
      )
    case 'insanity':
      return (
        <svg viewBox="0 0 28 28" aria-hidden="true">
          <path
            className={full ? 'hm-sigil' : undefined}
            d="M14 14m0-2a2 2 0 1 1-2 2 4 4 0 1 1 4 4 6 6 0 1 1-6-6 8 8 0 1 1 8 8"
            fill="none"
            stroke={full ? 'var(--accent)' : 'color-mix(in srgb, var(--text-secondary) 50%, transparent)'}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            className={full ? 'hm-beat' : undefined}
            d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"
            fill={full ? 'var(--accent)' : 'none'}
            stroke={full ? 'var(--accent)' : 'var(--text-secondary)'}
            strokeWidth="1.6"
          />
        </svg>
      )
  }
}
