import type { EffectsLevel } from '../hooks/useEffectsLevel'
import type { ThemeName } from '../types'
import '../styles/atmosphere.css'

interface AtmosphereProps {
  theme: ThemeName
  mood: string
  level: EffectsLevel
  /** 0 (fine) to 1 (no health left): drives themes that react to danger */
  madness?: number
}

/**
 * The ambient backdrop behind a screen: a mood-lit glow, the theme's texture
 * (stars, scanlines, fog, grain…) and occasional effects (rain, lightning).
 * Keyed by mood so a scene change cross-fades into the new backdrop.
 */
export function Atmosphere({ theme, mood, level, madness = 0 }: AtmosphereProps) {
  return (
    <div
      key={`${theme}-${mood}`}
      className={`atmos atmos--${theme} mood--${mood} atmos--${level}`}
      style={{ '--madness': madness } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="atmos__glow" />
      <div className="atmos__texture" />
      <div className="atmos__fx" />
      <div className="atmos__vignette" />
    </div>
  )
}
