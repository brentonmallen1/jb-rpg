import { useState, useEffect, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../context/useGame'
import { useSSE } from '../hooks/useSSE'
import * as api from '../hooks/api'
import { useMoments } from '../hooks/useMoments'
import { useEffectsLevel, type EffectsLevel } from '../hooks/useEffectsLevel'
import { useWakeLock } from '../hooks/useWakeLock'
import type { GameState, ResolvedContent } from '../types'
import { Modal, RulesModal, HealthMeter, MomentLayer, CriticalPulse, Atmosphere, CorruptText } from '../components'
import { HEALTH_LABEL, moodFor } from '../lib/themes'
import { BookIcon, D20Icon, MoonIcon, SparkIcon, SunIcon } from '../components/Icons'
import '../styles/phone.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']
const EFFECTS_LABEL: Record<EffectsLevel, string> = { full: 'Effects: full', subtle: 'Effects: subtle', off: 'Effects: off' }

export default function Player() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { toggleColorMode, colorMode, setTheme } = useGame()

  // Our own SSE connection, authenticated by the session id in the URL
  const { state, resolved, storytellerConnected } = useSSE({ sessionId })
  const { current: moment, done: momentDone } = useMoments(state, resolved)
  const effects = useEffectsLevel()
  useWakeLock(!!state)

  const [showRules, setShowRules] = useState(false)
  const [showHero, setShowHero] = useState(false)
  const [sessionCheck, setSessionCheck] = useState<'checking' | 'valid' | 'invalid'>('checking')

  // Remember that we were in a game, so an empty state reads as "ended", not "waiting"
  const [joinedGame, setJoinedGame] = useState(false)
  if (state && !joinedGame) setJoinedGame(true)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    api.checkSession(sessionId)
      .then(({ valid }) => { if (!cancelled) setSessionCheck(valid ? 'valid' : 'invalid') })
      // API error: assume valid and let SSE handle it
      .catch(() => { if (!cancelled) setSessionCheck('valid') })
    return () => { cancelled = true }
  }, [sessionId])

  // The story's theme comes from the server; players never load the story itself
  const storyTheme = resolved?.theme
  useEffect(() => {
    if (storyTheme) setTheme(storyTheme)
  }, [storyTheme, setTheme])

  const toolbar = (
    <header className="phone__bar">
      <span className="phone__story">{resolved?.story_title ?? "J&B's RPG"}</span>
      <div className="phone__tools">
        <button className="phone__tool" onClick={effects.cycle} aria-label={`${EFFECTS_LABEL[effects.level]} (tap to change)`} title={EFFECTS_LABEL[effects.level]}>
          <SparkIcon style={{ opacity: effects.level === 'off' ? 0.35 : effects.level === 'subtle' ? 0.65 : 1 }} />
        </button>
        <button className="phone__tool" onClick={() => setShowRules(true)} aria-label="Rules">
          <BookIcon />
        </button>
        <button className="phone__tool" onClick={toggleColorMode} aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}>
          {colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  )

  function screen(main: ReactNode, { center = false } = {}) {
    return (
      <div className={`phone ${effects.level === 'off' ? 'effects-off' : ''}`}>
        {toolbar}
        <main className={`phone__main ${center ? 'phone__main--center' : ''}`}>{main}</main>
        {state && !storytellerConnected && (
          <p className="phone__status phone__status--warn" role="status">The storyteller has stepped away…</p>
        )}
      </div>
    )
  }

  function renderContent() {
    if (!sessionId) {
      return screen(<Message title="Session link required" text="Use the link your storyteller shared to join the game." />, { center: true })
    }
    if (sessionCheck === 'checking') return screen(<p className="phone-label">Connecting…</p>, { center: true })
    if (sessionCheck === 'invalid') {
      return screen(<Message title="Session not found" text="This link is invalid or has expired. Ask the storyteller for a new one." />, { center: true })
    }
    if (!state || !resolved) {
      return joinedGame
        ? screen(<Message title="The session has ended" text="Thanks for playing. Ask the storyteller for a new link to join the next one." />, { center: true })
        : screen(<Message title="Waiting for the storyteller" text="The story will begin shortly." />, { center: true })
    }
    // Insanity: text starts to misbehave as sanity drains (gentler at "subtle", never at "off")
    const madness = 1 - state.hp / Math.max(resolved.max_hp, 1)
    const corruption = resolved.theme === 'insanity' && effects.level !== 'off'
      ? { madness: effects.level === 'full' ? madness : madness / 2, enabled: true }
      : { madness: 0, enabled: false }
    return screen(<GameScreen state={state} resolved={resolved} corruption={corruption} onShowHero={() => setShowHero(true)} />, {
      center: ['madlib_in_progress', 'character_reveal'].includes(state.status) || (state.status === 'game_over' && !!state.outcome_revealed),
    })
  }

  const lastLife = !!state && state.hp === 1 && state.status !== 'game_over'
  return (
    <>
      {resolved && (
        <Atmosphere
          theme={resolved.theme}
          mood={moodFor(resolved.theme, resolved.mood, resolved.mood_seed)}
          level={effects.level}
          madness={state ? 1 - state.hp / Math.max(resolved.max_hp, 1) : 0}
        />
      )}
      {renderContent()}
      <CriticalPulse active={lastLife} level={effects.level} />
      <MomentLayer moment={moment} theme={resolved?.theme ?? 'modern'} level={effects.level} onDone={momentDone} />

      <Modal isOpen={showHero && !!state?.character} onClose={() => setShowHero(false)} title={state?.character?.name || 'Your hero'}>
        <p className="phone-text" style={{ marginTop: 0 }}>{state?.character?.description}</p>
        <button className="btn btn--secondary mt-md" onClick={() => setShowHero(false)}>Close</button>
      </Modal>
      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </>
  )
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div aria-live="polite">
      <h1 className="phone-title">{title}</h1>
      <p className="phone-text">{text}</p>
    </div>
  )
}

interface GameScreenProps {
  state: GameState
  resolved: ResolvedContent
  corruption: { madness: number; enabled: boolean }
  onShowHero: () => void
}

function GameScreen({ state, resolved, corruption, onShowHero }: GameScreenProps) {
  const warp = (text: string) => <CorruptText text={text} madness={corruption.madness} enabled={corruption.enabled} />

  if (state.status === 'madlib_in_progress') {
    return (
      <div aria-live="polite">
        <div className="phone-eyebrow">Creating your hero</div>
        {resolved.madlib_question && <h1 className="phone-question" key={resolved.madlib_question}>{resolved.madlib_question}</h1>}
        <p className="phone-text">Call out your answer to the storyteller.</p>
        {resolved.madlib_progress && (
          <p className="phone-label" style={{ marginTop: 18 }}>
            Question {resolved.madlib_progress.step} of {resolved.madlib_progress.total}
          </p>
        )}
      </div>
    )
  }

  if (state.status === 'character_reveal' && state.character) {
    return (
      <div>
        <div className="phone-eyebrow">Your hero</div>
        <h1 className="phone-title">{state.character.name}</h1>
        <p className="phone-text">{state.character.description}</p>
      </div>
    )
  }

  if (state.status === 'game_over' && state.outcome && state.outcome_revealed) {
    return (
      <div>
        <div className={`phone-outcome phone-outcome--${state.outcome}`} role="status" aria-live="assertive">
          {state.outcome === 'victory' ? 'Victory' : 'Defeat'}
        </div>
        <p className="phone-text">
          Level {state.level} · {state.items.length === 1 ? '1 item' : `${state.items.length} items`}
          {state.items.length > 0 && `: ${state.items.join(', ')}`}
        </p>
      </div>
    )
  }

  const choosingDoor = state.status === 'awaiting_scene_selection'
  return (
    <>
      <div>
        <div className="phone-eyebrow">
          {resolved.finale ? 'The end has come' : choosingDoor ? 'The way forward' : state.status === 'opening_scene_active' ? 'Prologue' : resolved.scene_subtitle || 'Now'}
        </div>
        <h1 className="phone-title" key={resolved.finale ? 'finale' : resolved.scene_title}>
          {resolved.finale ? 'The final roll' : choosingDoor ? 'Choosing the next door…' : warp(resolved.scene_title ?? '')}
        </h1>
      </div>

      <div className="party-strip">
        <div>
          <div className="phone-label">{HEALTH_LABEL[resolved.theme]}</div>
          <div style={{ marginTop: 8 }}><HealthMeter hp={state.hp} max={resolved.max_hp} theme={resolved.theme} size={26} /></div>
        </div>
        <div className="party-strip__stats">
          <div><div className="phone-label">Level</div><div className="party-strip__value">{state.level}</div></div>
          <div><div className="phone-label">Items</div><div className="party-strip__value">{state.items.length}</div></div>
        </div>
      </div>

      {state.character && (
        <button type="button" className="hero-chip" onClick={onShowHero} aria-label={`About ${state.character.name}`}>
          <span className="hero-chip__name">{state.character.name}</span>
          <span className="hero-chip__desc">{state.character.description}</span>
        </button>
      )}

      {resolved.finale ? (
        <div className="phone-roll">
          <D20Icon size={140} className="d20" />
          <div className="phone-roll__stats">
            <div className="phone-roll__stat"><div className="phone-label">Bonus</div><div className="phone-roll__value">+{state.items.length}</div></div>
            <div className="phone-roll__stat"><div className="phone-label">Attempts</div><div className="phone-roll__value">{state.level}</div></div>
            <div className="phone-roll__stat"><div className="phone-label">Target</div><div className="phone-roll__value">20+</div></div>
          </div>
          <p className="phone-text" style={{ textAlign: 'center' }}>Roll a real d20 and add your bonus.</p>
        </div>
      ) : (
        <>
          {!choosingDoor && resolved.scene_text && (
            <details className="follow">
              <summary>Follow along</summary>
              <p className="phone-text">{warp(resolved.scene_text)}</p>
            </details>
          )}
          {resolved.visible_choices.length > 0 && (
            <div className="dealt" aria-live="polite">
              <span className="phone-label">The choices</span>
              {resolved.visible_choices.map((text, i) => (
                <div key={`${resolved.scene_title}-${i}`} className="dealt__card" style={{ '--i': i } as React.CSSProperties}>
                  <span className="dealt__numeral">{ROMAN[i] ?? i + 1}</span>
                  <span>{warp(text)}</span>
                </div>
              ))}
              <p className="phone__status" style={{ paddingTop: 6 }}>Decide together. The storyteller is listening.</p>
            </div>
          )}
        </>
      )}
    </>
  )
}
