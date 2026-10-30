import type { ThemeName } from '../types'
import { HEALTH_LABEL } from '../lib/themes'
import '../styles/health.css'

interface HealthMeterProps {
  hp: number
  max: number
  theme: ThemeName
  size?: number
}

/** The party's health, drawn in the theme's own iconography (lanterns, eyes, chips, hull plates, moons, hearts). */
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
        <svg viewBox="0 0 28 40" aria-hidden="true">
          <path d="M10 4h8M14 1v3" stroke="var(--text-primary)" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M8 8h12l2 4v18l-2 4H8l-2-4V12z" fill="color-mix(in srgb, var(--accent) 20%, transparent)" stroke="var(--text-primary)" strokeWidth="1.6" />
          <path className="hm-flame" d="M14 15c3 4 4 6 4 8a4 4 0 0 1-8 0c0-2 1-4 4-8z" fill="var(--accent)" />
          <path d="M6 36h16" stroke="var(--text-primary)" strokeWidth="1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 28 40" aria-hidden="true">
          <path d="M10 4h8M14 1v3" stroke="var(--text-secondary)" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M8 8h12l2 4v18l-2 4H8l-2-4V12z" fill="none" stroke="var(--text-secondary)" strokeWidth="1.6" />
          <path className="hm-smoke" d="M14 26c-1.5-2 1-3.5 0-5.5" fill="none" stroke="var(--text-secondary)" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M6 36h16" stroke="var(--text-secondary)" strokeWidth="1.6" />
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
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <g className="hm-cell">
            <path d="M10 2v5M16 2v5M22 2v5M10 25v5M16 25v5M22 25v5M2 10h5M2 16h5M2 22h5M25 10h5M25 16h5M25 22h5" stroke="var(--accent)" strokeWidth="1.5" />
            <rect x="7" y="7" width="18" height="18" rx="2" fill="color-mix(in srgb, var(--accent) 85%, transparent)" />
            <rect x="12" y="12" width="8" height="8" fill="var(--bg-primary)" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M10 2v5M16 2v5M22 2v5M10 25v5M16 25v5M22 25v5M2 10h5M2 16h5M2 22h5M25 10h5M25 16h5M25 22h5" stroke="color-mix(in srgb, var(--text-secondary) 40%, transparent)" strokeWidth="1.5" />
          <rect x="7" y="7" width="18" height="18" rx="2" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
          <path d="M11 8l5 7-3 3 5 6" fill="none" stroke="var(--danger)" strokeWidth="1.5" />
        </svg>
      )
    case 'deep_space':
      return full ? (
        <svg viewBox="0 0 34 30" aria-hidden="true">
          <g className="hm-shield">
            <path d="M7 2h20l6 6v14l-6 6H7l-6-6V8z" fill="color-mix(in srgb, var(--accent) 80%, transparent)" stroke="var(--accent)" strokeWidth="1.4" />
            <path d="M5 15h24" stroke="color-mix(in srgb, var(--bg-primary) 55%, transparent)" strokeWidth="1.2" />
            <g fill="color-mix(in srgb, var(--bg-primary) 65%, transparent)">
              <circle cx="7" cy="8" r="1.2" /><circle cx="27" cy="8" r="1.2" /><circle cx="7" cy="22" r="1.2" /><circle cx="27" cy="22" r="1.2" />
            </g>
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 34 30" aria-hidden="true">
          <path d="M7 2h20l6 6v14l-6 6H7l-6-6V8z" fill="none" stroke="var(--text-secondary)" strokeWidth="1.4" strokeDasharray="4 2" />
          <path d="M15 2l3 7-4 4 5 5-3 10" fill="none" stroke="var(--danger)" strokeWidth="1.4" />
        </svg>
      )
    case 'insanity':
      return full ? (
        <svg viewBox="0 0 30 30" aria-hidden="true">
          <g className="hm-moon">
            <circle cx="15" cy="15" r="12" fill="var(--accent)" />
            <circle cx="11" cy="11" r="2" fill="color-mix(in srgb, var(--bg-primary) 20%, transparent)" />
            <circle cx="19" cy="18" r="3" fill="color-mix(in srgb, var(--bg-primary) 20%, transparent)" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 30 30" aria-hidden="true">
          <circle cx="15" cy="15" r="12" fill="none" stroke="color-mix(in srgb, var(--text-secondary) 40%, transparent)" strokeWidth="1.4" />
          <path d="M15 3a12 12 0 0 1 0 24 8 12 0 0 0 0-24z" fill="color-mix(in srgb, var(--danger) 60%, transparent)" />
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
