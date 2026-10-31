import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { momentCopy } from '../lib/moments'
import { HEALTH_LABEL } from '../lib/themes'
import { OUTCOME_ICON } from '../lib/outcomes'
import type { GameState, JourneyStep, ResolvedContent, ThemeName } from '../types'
import { Crest } from './Crest'
import { HealthMeter } from './HealthMeter'
import { ItemIcon } from './ItemIcon'
import { CloseIcon } from './Icons'
import '../styles/keepsake.css'

// Each theme titles its keepsake its own way
const HEADING: Record<ThemeName, { title: string; log: string }> = {
  fantasy: { title: 'The chronicle of', log: 'Remembered' },
  deep_space: { title: 'Mission report', log: 'Flight log' },
  cyberpunk: { title: 'Run log', log: '// Events' },
  horror: { title: 'What became of', log: 'What happened' },
  insanity: { title: 'Fragments of', log: 'What we recall' },
  modern: { title: 'The story of', log: 'Along the way' },
}

// A lost game: each theme mourns its own way (a heading, a last line, and a mark on the card)
const DEFEAT: Record<ThemeName, { title: string; epitaph: string }> = {
  fantasy: { title: 'Here ends the tale of', epitaph: 'The last lantern has gone out.' },
  deep_space: { title: 'Last log of', epitaph: 'Signal lost. No further transmissions.' },
  cyberpunk: { title: 'Last run of', epitaph: 'Connection terminated. No backup found.' },
  horror: { title: 'What became of', epitaph: 'They were never found.' },
  insanity: { title: 'What remains of', epitaph: 'They went mad, and they are still smiling.' },
  modern: { title: 'In memory of', epitaph: 'They didn’t make it home.' },
}

/** The mark a lost game leaves on the card, drawn over it */
function DefeatMark({ theme }: { theme: ThemeName }) {
  switch (theme) {
    case 'fantasy':  // a mourning ribbon across the corner
      return <svg className="keepsake__mark" viewBox="0 0 540 960" aria-hidden="true"><path d="M0 120L120 0h70L0 190z" fill="#0c0806" opacity=".85" /><path d="M0 132L132 0M0 178L178 0" stroke="#d9a557" strokeWidth="1" opacity=".5" /></svg>
    case 'deep_space':  // stamped across the patch
      return <div className="keepsake__mark keepsake__stamp">Signal lost</div>
    case 'cyberpunk':  // the line goes flat
      return (
        <svg className="keepsake__mark" viewBox="0 0 540 960" aria-hidden="true">
          <path d="M0 222h168l10-18 12 34 14-66 12 50h324" fill="none" stroke="var(--danger)" strokeWidth="2.5" strokeLinejoin="round" opacity=".85" />
        </svg>
      )
    case 'horror':  // something with claws
      return (
        <svg className="keepsake__mark" viewBox="0 0 540 960" aria-hidden="true">
          <g fill="none" stroke="var(--danger)" strokeLinecap="round" opacity=".55">
            <path d="M372 40c-14 50-34 100-62 150" strokeWidth="6" />
            <path d="M404 50c-16 56-38 112-70 166" strokeWidth="8" />
            <path d="M434 66c-14 50-34 98-60 142" strokeWidth="5" />
          </g>
        </svg>
      )
    case 'insanity':  // the walls are written on
      return (
        <div className="keepsake__mark keepsake__scrawl" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => <span key={i}>{i % 3 === 2 ? 'IT SEES IT SEES IT SEES' : 'it is behind the stars it is behind the stars'}</span>)}
        </div>
      )
    case 'modern':
      return null  // the card fades, like an old photo (keepsake.css)
  }
}

/** One line of the journey, in the theme's words */
function stepLine(theme: ThemeName, step: JourneyStep): string {
  if (step.outcome === 'item') return step.item_name ? `Found ${step.item_name}` : momentCopy(theme, 'item_gained')
  if (step.outcome === 'damage') return momentCopy(theme, 'hp_lost')
  return momentCopy(theme, 'level_up')
}

/** The digital rolls in words: "Rolled 14 and 19, with 2 to add" */
function rollLine(rolls: number[], bonus: number): string {
  const listed = rolls.length === 1 ? `${rolls[0]}` : `${rolls.slice(0, -1).join(', ')} and ${rolls.at(-1)}`
  return `Rolled ${listed}${bonus ? `, with ${bonus} to add` : ''}`
}

/** Long games keep their start and their end (`max` lines in all, the gap counting as one) */
function trimJourney(journey: JourneyStep[], max: number): (JourneyStep | number)[] {
  if (journey.length <= max) return journey
  const head = Math.floor((max - 1) / 2)
  const tail = max - 1 - head
  return [...journey.slice(0, head), journey.length - head - tail, ...journey.slice(-tail)]
}

interface KeepsakeProps {
  state: GameState
  resolved: ResolvedContent
}

/** The keepsake card: a story-sized summary of the game, in the story's theme. */
function KeepsakeCard({ state, resolved, cardRef }: KeepsakeProps & { cardRef: React.Ref<HTMLDivElement> }) {
  const theme = resolved.theme
  const hero = state.character
  const outcome = state.outcome ?? 'victory'
  const lost = outcome === 'defeat'
  const heading = lost ? { ...HEADING[theme], title: DEFEAT[theme].title } : HEADING[theme]
  const rolled = (state.final_rolls?.length ?? 0) > 0
  // The roll and the last line take room from the journey
  const journey = trimJourney(resolved.journey ?? [], 7 - (rolled ? 1 : 0) - (lost ? 1 : 0))
  const name = hero?.name ?? resolved.story_title
  // Insanity's lost heroes come apart on the card: each letter knocked askew (fixed once drawn, so the image matches)
  const [askew] = useState(() => [...name].map(() => ({ turn: Math.random() * 18 - 9, drop: Math.random() * 10 - 5 })))
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className={`keepsake ${lost ? `keepsake--defeat keepsake--defeat-${theme}` : ''}`} ref={cardRef}>
      {lost && <DefeatMark theme={theme} />}
      <div className="keepsake__story">{resolved.story_title}</div>
      {hero && <Crest character={hero} variant={state.crest} emblem={state.emblem} theme={theme} size={112} className="keepsake__crest" />}
      <div className="keepsake__heading">{heading.title}</div>
      <div className="keepsake__name" aria-label={name}>
        {lost && theme === 'insanity'
          ? [...name].map((ch, i) => (
              <span key={i} className="keepsake__askew" aria-hidden="true" style={{ transform: `translateY(${askew[i].drop}px) rotate(${askew[i].turn}deg)` }}>{ch}</span>
            ))
          : name}
      </div>

      <div className={`keepsake__outcome keepsake__outcome--${outcome}`}>
        <span className="keepsake__rule" />
        <span>{momentCopy(theme, outcome)}</span>
        <span className="keepsake__rule" />
      </div>
      {lost && <div className="keepsake__epitaph">{DEFEAT[theme].epitaph}</div>}

      {rolled && (
        <div className="keepsake__roll">
          <svg width="58" height="62" viewBox="0 0 58 62" aria-hidden="true">
            <path d="M29 2l25 14v30L29 60 4 46V16z" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
            <path d="M29 2L15 24h28zM15 24L4 16M43 24l11-8M15 24l14 26 14-26M29 50v10M4 46l25 4 25-4" fill="none" stroke="var(--accent)" strokeWidth=".8" opacity=".55" />
            <text x="29" y="40" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="17" fill="var(--text-primary)">{state.final_rolls.at(-1)}</text>
          </svg>
          <div>
            <div className="keepsake__roll-label">The final roll</div>
            <div className="keepsake__roll-line">{rollLine(state.final_rolls, state.items.length)}</div>
          </div>
        </div>
      )}

      <div className="keepsake__stats">
        <div>
          <div className="keepsake__label">{HEALTH_LABEL[theme]}</div>
          <HealthMeter hp={state.hp} max={resolved.max_hp} theme={theme} size={20} width={170} />
        </div>
        <div>
          <div className="keepsake__label">Level</div>
          <div className="keepsake__value">{state.level}</div>
        </div>
        <div>
          <div className="keepsake__label">Items</div>
          <div className="keepsake__value">{state.items.length}</div>
        </div>
      </div>

      {journey.length > 0 && (
        <div className="keepsake__log">
          <div className="keepsake__label keepsake__label--center">{heading.log}</div>
          <ol>
            {journey.map((step, i) => {
              if (typeof step === 'number') {
                return <li key={`gap-${i}`} className="keepsake__gap">… {step} more {step === 1 ? 'scene' : 'scenes'} …</li>
              }
              const Icon = OUTCOME_ICON[step.outcome]
              return (
                <li key={`${step.scene_title}-${i}`}>
                  {step.outcome === 'item' && step.item_name
                    ? <ItemIcon name={step.item_name} icon={step.item_icon} theme={theme} size={18} className="outcome--item" />
                    : <Icon size={18} className={`outcome--${step.outcome}`} />}
                  <span>
                    <span className="keepsake__scene">{step.scene_title}</span>
                    <span className="keepsake__what">{stepLine(theme, step)}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <div className="keepsake__foot">
        <span>{date}</span>
        <span className="keepsake__brand">J&amp;B’s RPG</span>
      </div>
    </div>
  )
}

function fileName(state: GameState, resolved: ResolvedContent): string {
  const who = (state.character?.name ?? resolved.story_title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `keepsake-${who || 'game'}.png`
}

/** The keepsake, full screen, with Share (where the device can share files) and Save. */
export function KeepsakeDialog({ open, state, resolved, onClose }: KeepsakeProps & { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<'share' | 'save' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Fit the 540×960 card to the screen; the image is always made at full size
  useEffect(() => {
    if (!open) return
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / 540, (window.innerHeight - 150) / 960))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open])

  async function image(): Promise<File | null> {
    if (!card.current) return null
    const url = await toPng(card.current, { pixelRatio: 2, cacheBust: true })
    const blob = await (await fetch(url)).blob()
    return new File([blob], fileName(state, resolved), { type: 'image/png' })
  }

  const canShare = typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [new File([''], 'keepsake.png', { type: 'image/png' })] })

  async function share() {
    setBusy('share')
    setMessage(null)
    try {
      const file = await image()
      if (file) await navigator.share({ files: [file], title: resolved.story_title })
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setMessage('Couldn’t share it. Try Save instead.')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    setMessage(null)
    try {
      const file = await image()
      if (!file) return
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setMessage('Saved.')
    } catch {
      setMessage('Couldn’t make the image.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <dialog ref={dialog} className="keepsake-dialog" aria-label="Your keepsake" onClose={onClose}>
      <button type="button" className="keepsake-dialog__close" onClick={onClose} aria-label="Close">
        <CloseIcon size={20} />
      </button>
      <div className="keepsake-dialog__stage" style={{ width: 540 * scale, height: 960 * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {open && <KeepsakeCard state={state} resolved={resolved} cardRef={card} />}
        </div>
      </div>
      <div className="keepsake-dialog__actions">
        {canShare && (
          <button type="button" className="keepsake-dialog__button keepsake-dialog__button--primary" onClick={share} disabled={!!busy}>
            {busy === 'share' ? 'Preparing…' : 'Share'}
          </button>
        )}
        <button type="button" className={`keepsake-dialog__button ${canShare ? '' : 'keepsake-dialog__button--primary'}`} onClick={save} disabled={!!busy}>
          {busy === 'save' ? 'Preparing…' : 'Save image'}
        </button>
      </div>
      {message && <p className="keepsake-dialog__message" role="status">{message}</p>}
    </dialog>
  )
}
