import type { EffectsLevel } from '../hooks/useEffectsLevel'
import type { ThemeName } from '../types'
import '../styles/telling.css'

/**
 * On phones, while the storyteller tells a scene: its words are still blurred, and a small
 * themed "pen" waits at the end of them so the screen is plainly alive. The words arrive
 * with the choices. Full effects animate the pen; gentle keeps only slow fades; off holds still.
 */
export function StoryBeingTold({ theme, level }: { theme: ThemeName; level: EffectsLevel }) {
  return (
    <div className={`telling telling--${level}`} role="status">
      <span className="visually-hidden">The storyteller is telling this scene. Its words arrive with the choices.</span>
      <div className="telling__lines" aria-hidden="true">
        <span className="telling__line" />
        <span className="telling__line" />
        <span className="telling__line" />
        <span className="telling__line" />
        <span className="telling__pen">
          <span className="telling__glow" />
          <Pen theme={theme} />
        </span>
      </div>
    </div>
  )
}

function Pen({ theme }: { theme: ThemeName }) {
  switch (theme) {
    case 'fantasy':
      return (
        <svg className="pen pen--quill" width="26" height="28" viewBox="0 0 26 28">
          <path d="M2 26C6 16 12 7 24 2c-3 8-8 15-17 20z" fill="var(--accent)" />
          <path d="M2 26l9-11" stroke="var(--bg-primary)" strokeWidth="1.2" />
        </svg>
      )
    case 'deep_space':
      return (
        <svg className="pen pen--satellite" width="44" height="34" viewBox="-14 -26 44 34">
          <g fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round">
            <path className="pen__arc" d="M-6 -2a7 7 0 0 1 2-8" />
            <path className="pen__arc pen__arc--late" d="M-10 0a12 12 0 0 1 3-13" />
          </g>
          <g className="pen__body">
            <g transform="rotate(-25 9 -10)">
              <rect x="-1" y="-17" width="7" height="3" fill="var(--bg-secondary)" stroke="var(--text-secondary)" strokeWidth=".8" />
              <rect x="12" y="-6" width="7" height="3" fill="var(--bg-secondary)" stroke="var(--text-secondary)" strokeWidth=".8" />
              <rect x="6" y="-14" width="7" height="7" rx="1.5" fill="var(--text-primary)" />
            </g>
            <path d="M5 -9a4 4 0 0 0 1 5" fill="none" stroke="var(--text-primary)" strokeWidth="1.3" />
            <circle className="pen__beacon" cx="12" cy="-16" r="1.6" fill="var(--accent)" />
          </g>
        </svg>
      )
    case 'cyberpunk':
      return (
        <span className="pen pen--cursor">
          <span className="pen__chroma pen__chroma--r" />
          <span className="pen__chroma pen__chroma--c" />
          <span className="pen__block" />
          <span className="pen__slice" />
          <span className="pen__code">0x3F</span>
        </span>
      )
    case 'horror':
      return (
        <span className="pen pen--wisp">
          <span className="pen__aura" />
          <span className="pen__tail" />
          <span className="pen__trail" />
          <span className="pen__core" />
        </span>
      )
    case 'insanity':
      return (
        <svg className="pen pen--eye" width="40" height="40" viewBox="-20 -16 40 40">
          <g fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" opacity=".75">
            <path className="pen__tendril" d="M-4 4c-2 5-8 6-9 11 0 3 3 4 4 2" />
            <path className="pen__tendril pen__tendril--2" d="M1 5c1 6-3 9-1 13 1 2 4 1 3-1" />
            <path className="pen__tendril pen__tendril--3" d="M5 4c3 4 9 4 10 9 0 3-3 3-3 1" />
          </g>
          <g className="pen__lid">
            <path d="M-12 0C-6-8 6-8 12 0 6 8-6 8-12 0z" fill="var(--bg-secondary)" stroke="var(--accent)" strokeWidth="1.3" />
            <g className="pen__look">
              <circle r="4.2" fill="var(--accent)" />
              <ellipse rx="1" ry="3.4" fill="var(--bg-primary)" />
            </g>
          </g>
        </svg>
      )
    default:
      return (
        <svg className="pen pen--nib" width="18" height="40" viewBox="-9 -30 18 40">
          <g className="pen__body">
            <path d="M0 -2L-6 -14v-8h12v8z" fill="var(--accent)" />
            <path d="M-6 -22h12v-6h-12z" fill="var(--text-primary)" />
            <path d="M0 -2v-10" stroke="var(--bg-primary)" strokeWidth="1" />
            <circle cx="0" cy="-13" r="1.6" fill="var(--bg-primary)" />
          </g>
          <circle className="pen__drop" cx="0" cy="1" r="2" fill="var(--accent)" />
        </svg>
      )
  }
}
