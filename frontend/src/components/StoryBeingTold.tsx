import type { EffectsLevel } from '../hooks/useEffectsLevel'
import type { ThemeName } from '../types'
import { BookIcon } from './Icons'
import '../styles/telling.css'

/**
 * On phones, while the storyteller tells a scene: its words are still blurred, and a small
 * themed "pen" waits at the end of them so the screen is plainly alive. A player can read
 * along instead (the words, with the pen still writing at their end); otherwise the words
 * arrive with the choices. Full effects animate the pen; gentle keeps only slow fades; off holds still.
 */
export function StoryBeingTold({ theme, level, onReadAlong }: { theme: ThemeName; level: EffectsLevel; onReadAlong?: () => void }) {
  return (
    <>
      <div className={`telling telling--${level}`} role="status">
        <span className="visually-hidden">The storyteller is telling this scene.</span>
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
      {onReadAlong && (
        <button type="button" className="read-along__toggle telling__read" onClick={onReadAlong}>
          <BookIcon size={16} />
          Read along
        </button>
      )}
    </>
  )
}

/** The pen alone, writing at the end of the words while a player reads along as the scene is told. */
export function TellingPen({ theme, level }: { theme: ThemeName; level: EffectsLevel }) {
  return (
    <span className={`telling telling--${level} telling--inline`} aria-hidden="true">
      <span className="telling__pen">
        <span className="telling__glow" />
        <Pen theme={theme} />
      </span>
    </span>
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
        <svg className="pen pen--eye" width="44" height="46" viewBox="-22 -18 44 46">
          <defs>
            <radialGradient id="pen-eye-aura">
              <stop offset="0" className="pen__aura-in" />
              <stop offset="1" className="pen__aura-out" />
            </radialGradient>
            <radialGradient id="pen-eye-iris">
              <stop offset="0" className="pen__iris-in" />
              <stop offset=".7" className="pen__iris-mid" />
              <stop offset="1" className="pen__iris-out" />
            </radialGradient>
          </defs>
          <ellipse className="pen__aura" rx="20" ry="14" fill="url(#pen-eye-aura)" />
          {/* Uneven tendrils reach out from behind the eye, each curling at its own pace */}
          <g className="pen__tendrils">
            <g transform="translate(-11 1) rotate(62) scale(.7 1.25)"><path className="pen__tendril" d="M0 0c-.6 3.6-3.4 5.8-3.6 9.4-.2 2.2 1.8 3.2 2.8 1.6-.8.1-1.3-.7-.9-1.7C-.6 6.6 1.4 3.6 1.2 0z" /></g>
            <g transform="translate(-6 5) rotate(22) scale(.6 .9)"><path className="pen__tendril pen__tendril--2" d="M0 0c-.6 3.6-3.4 5.8-3.6 9.4-.2 2.2 1.8 3.2 2.8 1.6-.8.1-1.3-.7-.9-1.7C-.6 6.6 1.4 3.6 1.2 0z" /></g>
            <g transform="translate(1 6) rotate(-6) scale(.75 1.4)"><path className="pen__tendril pen__tendril--3" d="M0 0c-.6 3.6-3.4 5.8-3.6 9.4-.2 2.2 1.8 3.2 2.8 1.6-.8.1-1.3-.7-.9-1.7C-.6 6.6 1.4 3.6 1.2 0z" /></g>
            <g transform="translate(9 3) scale(-1 1) rotate(35) scale(.55 1.05)"><path className="pen__tendril pen__tendril--4" d="M0 0c-.6 3.6-3.4 5.8-3.6 9.4-.2 2.2 1.8 3.2 2.8 1.6-.8.1-1.3-.7-.9-1.7C-.6 6.6 1.4 3.6 1.2 0z" /></g>
            <g transform="translate(12 -1) scale(-1 1) rotate(78) scale(.6 .8)"><path className="pen__tendril pen__tendril--5" d="M0 0c-.6 3.6-3.4 5.8-3.6 9.4-.2 2.2 1.8 3.2 2.8 1.6-.8.1-1.3-.7-.9-1.7C-.6 6.6 1.4 3.6 1.2 0z" /></g>
          </g>
          <ellipse className="pen__socket" rx="16" ry="10" />
          <g className="pen__lid">
            <path className="pen__sclera" d="M-13 0C-7-9 7-9 13 0 7 9-7 9-13 0z" />
            <path className="pen__vein" d="M-12.5 0c2-.5 3 .8 4.5.2M-11-3.5c1.6 1 2.2 2.4 3.6 2.4M12.5.5c-2 .3-2.8-.9-4.2-.1" />
            <g className="pen__look">
              <circle r="5" fill="url(#pen-eye-iris)" />
              <ellipse className="pen__pupil" rx="1.1" ry="4.2" />
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
