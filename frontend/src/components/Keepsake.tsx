import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { momentCopy } from '../lib/moments'
import { HEALTH_LABEL } from '../lib/themes'
import { OUTCOME_ICON } from '../lib/outcomes'
import type { GameState, JourneyStep, ResolvedContent, ThemeName } from '../types'
import { Crest } from './Crest'
import { HealthMeter } from './HealthMeter'
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

/** One line of the journey, in the theme's words */
function stepLine(theme: ThemeName, step: JourneyStep): string {
  if (step.outcome === 'item') return step.item_name ? `Found ${step.item_name}` : momentCopy(theme, 'item_gained')
  if (step.outcome === 'damage') return momentCopy(theme, 'hp_lost')
  return momentCopy(theme, 'level_up')
}

/** Long games keep their start and their end */
function trimJourney(journey: JourneyStep[]): (JourneyStep | number)[] {
  if (journey.length <= 7) return journey
  return [...journey.slice(0, 3), journey.length - 6, ...journey.slice(-3)]
}

interface KeepsakeProps {
  state: GameState
  resolved: ResolvedContent
}

/** The keepsake card: a story-sized summary of the game, in the story's theme. */
function KeepsakeCard({ state, resolved, cardRef }: KeepsakeProps & { cardRef: React.Ref<HTMLDivElement> }) {
  const theme = resolved.theme
  const hero = state.character
  const heading = HEADING[theme]
  const outcome = state.outcome ?? 'victory'
  const journey = trimJourney(resolved.journey ?? [])
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="keepsake" ref={cardRef}>
      <div className="keepsake__story">{resolved.story_title}</div>
      {hero && <Crest character={hero} variant={state.crest} theme={theme} size={112} className="keepsake__crest" />}
      <div className="keepsake__heading">{heading.title}</div>
      <div className="keepsake__name">{hero?.name ?? resolved.story_title}</div>

      <div className={`keepsake__outcome keepsake__outcome--${outcome}`}>
        <span className="keepsake__rule" />
        <span>{momentCopy(theme, outcome)}</span>
        <span className="keepsake__rule" />
      </div>

      <div className="keepsake__stats">
        <div>
          <div className="keepsake__label">{HEALTH_LABEL[theme]}</div>
          <HealthMeter hp={state.hp} max={resolved.max_hp} theme={theme} size={20} />
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
                  <Icon size={18} className={`outcome--${step.outcome}`} />
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
