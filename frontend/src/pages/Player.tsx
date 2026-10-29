import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../context/useGame'
import { useSSE } from '../hooks/useSSE'
import * as api from '../hooks/api'
import { useMoments } from '../hooks/useMoments'
import { capLevel, useEffectsLevel, type EffectsLevel } from '../hooks/useEffectsLevel'
import { useWakeLock } from '../hooks/useWakeLock'
import { useTextSize } from '../hooks/useTextSize'
import { usePlayerIdentity, type PlayerIdentity } from '../hooks/usePlayerIdentity'
import { formatClock, useCountdown } from '../hooks/useCountdown'
import type { GameState, ResolvedContent } from '../types'
import { StoryBeingTold, RulesModal, HealthMeter, MomentLayer, CriticalPulse, Atmosphere, CorruptText } from '../components'
import { HEALTH_LABEL, moodFor } from '../lib/themes'
import { ArrowDownIcon, BookIcon, ChevronUpIcon, D20Icon } from '../components/Icons'
import { PhoneSettings } from './player/PhoneSettings'
import '../styles/phone.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']

export default function Player() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { toggleColorMode, colorMode, setTheme } = useGame()

  // Our own SSE connection, authenticated by the session id in the URL (and our name, once joined)
  const player = usePlayerIdentity(sessionId)
  const { state, resolved, storytellerConnected } = useSSE({ sessionId, playerToken: player.identity?.token })
  const { current: moment, done: momentDone } = useMoments(state, resolved)
  const effects = useEffectsLevel()
  // This phone's own choice, capped when the table asked for no flashing
  const level = capLevel(effects.level, state?.no_flashing)
  const textSize = useTextSize()
  useWakeLock(!!state)

  // On the last life, phones that can vibrate give a heartbeat at each new scene and when the choices are dealt
  const lastLife = !!state && state.hp === 1 && state.status !== 'game_over'
  const beat = lastLife && level === 'full' ? `${state.current_scene_id}:${state.choices_revealed}` : null
  useEffect(() => {
    if (beat) navigator.vibrate?.([70, 120, 110])
  }, [beat])

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
        <button className="phone__tool" onClick={() => setShowRules(true)} aria-label="Rules">
          <BookIcon />
        </button>
        <PhoneSettings
          effects={effects.level}
          tableCalm={!!state?.no_flashing}
          onEffectsChange={effects.setLevel}
          textSize={textSize.size}
          onTextSizeChange={textSize.setSize}
          dark={colorMode === 'dark'}
          onToggleDark={toggleColorMode}
        />
      </div>
    </header>
  )

  function screen(main: ReactNode, { center = false } = {}) {
    return (
      <div className={`phone ${level === 'off' ? 'effects-off' : ''}`}>
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
    // Turn-taking games ask each phone for a name first (or they can just watch)
    if (state.turn_mode !== 'storyteller' && !player.identity && !player.watching && state.status !== 'game_over') {
      return screen(<JoinScreen onJoin={player.join} onWatch={player.watch} voting={state.turn_mode === 'vote'} />, { center: true })
    }

    // Insanity: text starts to flicker as sanity drains (full effects only: flicker is a flash)
    const madness = 1 - state.hp / Math.max(resolved.max_hp, 1)
    const corruption = resolved.theme === 'insanity' && level === 'full'
      ? { madness, enabled: true }
      : { madness: 0, enabled: false }
    return screen(<GameScreen state={state} resolved={resolved} corruption={corruption} level={level} me={player.identity} onShowHero={() => setShowHero(true)} />, {
      center: ['madlib_in_progress', 'character_reveal'].includes(state.status) || (state.status === 'game_over' && !!state.outcome_revealed),
    })
  }

  return (
    <>
      {resolved && (
        <Atmosphere
          theme={resolved.theme}
          mood={moodFor(resolved.theme, resolved.mood, resolved.mood_seed)}
          level={level}
          madness={state ? 1 - state.hp / Math.max(resolved.max_hp, 1) : 0}
        />
      )}
      {renderContent()}
      <CriticalPulse active={lastLife} level={level} />
      <MomentLayer moment={moment} theme={resolved?.theme ?? 'modern'} level={level} onDone={momentDone} viewerId={player.identity?.id} />

      {state?.character && <HeroSheet open={showHero} state={state} onClose={() => setShowHero(false)} />}
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

function JoinScreen({ onJoin, onWatch, voting }: { onJoin: (name: string) => Promise<void>; onWatch: () => void; voting: boolean }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onJoin(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="join" onSubmit={submit}>
      <div className="phone-eyebrow">{voting ? 'The table votes' : 'This game takes turns'}</div>
      <h1 className="phone-title">What should we call you?</h1>
      <p className="phone-text">{voting ? 'You’ll vote on each choice from your phone.' : 'When it’s your turn, the choice is yours to make.'}</p>
      <input
        className="join__input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Your name"
        aria-label="Your name"
        maxLength={24}
        autoFocus
        autoComplete="nickname"
      />
      {error && <p className="join__error" role="alert">{error}</p>}
      <button className="join__button" type="submit" disabled={!name.trim() || busy}>Join the table</button>
      <button className="join__watch" type="button" onClick={onWatch}>Just watch</button>
    </form>
  )
}

interface GameScreenProps {
  state: GameState
  resolved: ResolvedContent
  corruption: { madness: number; enabled: boolean }
  level: EffectsLevel
  me: PlayerIdentity | null
  onShowHero: () => void
}

function GameScreen({ state, resolved, corruption, level, me, onShowHero }: GameScreenProps) {
  const myTurn = !!me && resolved.decider?.id === me.id
  const [pickError, setPickError] = useState<string | null>(null)
  async function pick(index: number) {
    if (!me) return
    setPickError(null)
    try {
      await api.proposeChoice(me.token, state.proposal === index ? null : index)
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not pick that')
    }
  }
  const warp = (text: string) => <CorruptText text={text} madness={corruption.madness} enabled={corruption.enabled} />
  const [choicesEl, setChoicesEl] = useState<HTMLDivElement | null>(null)

  // A new scene starts at the top, wherever the last one was scrolled to
  const sceneKey = `${state.status}:${state.current_scene_id ?? ''}`
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [sceneKey])

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

      {!resolved.finale && !choosingDoor && (resolved.scene_text_pending
        ? <StoryBeingTold theme={resolved.theme} level={level} />
        : resolved.scene_text && <SceneText text={warp(resolved.scene_text)} sceneKey={resolved.scene_title ?? ''} />)}

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
          {['rotate', 'pick'].includes(state.turn_mode) && state.status === 'running' && (
            <TurnBanner decider={resolved.decider} mine={myTurn} mode={state.turn_mode} />
          )}
          <div className="phone-choices" ref={setChoicesEl}>
          {state.turn_mode === 'vote' && resolved.vote && resolved.visible_choices.length > 0 ? (
            <VotePanel
              key={resolved.scene_title}
              vote={resolved.vote}
              choices={resolved.visible_choices}
              me={me}
              renderText={text => warp(text)}
            />
          ) : resolved.visible_choices.length > 0 && (
            <div className="dealt" aria-live="polite">
              <span className="phone-label">{myTurn ? 'Tap your choice' : 'The choices'}</span>
              {resolved.visible_choices.map((text, i) => {
                const picked = state.proposal === i
                const content = (
                  <>
                    <span className="dealt__numeral">{ROMAN[i] ?? i + 1}</span>
                    <span>{warp(text)}</span>
                    {picked && resolved.decider && <span className="dealt__pick">{myTurn ? 'Your pick' : `${resolved.decider.name}'s pick`}</span>}
                  </>
                )
                const key = `${resolved.scene_title}-${i}`
                const props = { className: `dealt__card ${picked ? 'is-picked' : ''}`, style: { '--i': i } as React.CSSProperties }
                return myTurn
                  ? <button key={key} {...props} type="button" aria-pressed={picked} onClick={() => pick(i)}>{content}</button>
                  : <div key={key} {...props}>{content}</div>
              })}
              {pickError && <p className="join__error" role="alert">{pickError}</p>}
              <p className="phone__status" style={{ paddingTop: 6 }}>
                {myTurn ? 'Talk it over, then tap. The storyteller makes it official.' :
                  resolved.decider ? `${resolved.decider.name} has the final say.` : 'Decide together. The storyteller is listening.'}
              </p>
            </div>
          )}
          </div>
        </>
      )}

      <HeroDock state={state} resolved={resolved} choicesEl={resolved.visible_choices.length > 0 ? choicesEl : null} onShowHero={onShowHero} />
    </>
  )
}

/**
 * The scene's text, for reading along while the storyteller reads it aloud: the opening lines,
 * fading out, until the player opens the rest. Stays open from scene to scene once opened.
 */
function SceneText({ text, sceneKey }: { text: ReactNode; sceneKey: string }) {
  const [open, setOpen] = useState(false)
  // Short scenes are shown whole, with nothing to open
  const [long, setLong] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      el.classList.remove('is-clamped')
      const lines = el.scrollHeight / parseFloat(getComputedStyle(el).lineHeight)
      setLong(lines > 3.5)
      el.classList.add('is-clamped')
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el.parentElement ?? el)
    return () => observer.disconnect()
  }, [sceneKey])

  return (
    <section className={`read-along ${open || !long ? 'is-open' : ''}`} aria-label="The scene">
      <div ref={ref} className="read-along__text phone-text is-clamped" id="scene-text">{text}</div>
      {long && (
        <button type="button" className="read-along__toggle" aria-expanded={open} aria-controls="scene-text" onClick={() => setOpen(!open)}>
          <BookIcon size={16} />
          {open ? 'Show less' : 'Read along'}
        </button>
      )}
    </section>
  )
}

/**
 * The hero, docked at the bottom of the screen so it never moves: name, health, level, items.
 * Tapping it opens their story. When the choices are dealt but off-screen, a chip points to them.
 */
function HeroDock({ state, resolved, choicesEl, onShowHero }: { state: GameState; resolved: ResolvedContent; choicesEl: HTMLElement | null; onShowHero: () => void }) {
  const hero = state.character
  const [choicesHidden, setChoicesHidden] = useState(false)

  useEffect(() => {
    if (!choicesEl) return
    const observer = new IntersectionObserver(
      ([entry]) => setChoicesHidden(!entry.isIntersecting && entry.boundingClientRect.top > 0),
      { rootMargin: '0px 0px -120px 0px' },  // the dock covers the bottom of the screen
    )
    observer.observe(choicesEl)
    return () => observer.disconnect()
  }, [choicesEl])

  const stats = (
    <>
      <span className="dock__health" aria-label={`${HEALTH_LABEL[resolved.theme]}: ${state.hp} of ${resolved.max_hp}`}>
        <HealthMeter hp={state.hp} max={resolved.max_hp} theme={resolved.theme} size={20} />
      </span>
      <span className="dock__stat"><span className="phone-label">Lvl</span><span className="dock__value">{state.level}</span></span>
      <span className="dock__stat"><span className="phone-label">Items</span><span className="dock__value">{state.items.length}</span></span>
    </>
  )

  return (
    <div className="dock">
      {choicesEl && choicesHidden && (
        <button
          type="button"
          className="dock__chip"
          onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
        >
          The choices are in <ArrowDownIcon size={16} />
        </button>
      )}
      {hero ? (
        <button type="button" className="dock__bar" onClick={onShowHero} aria-label={`Your hero, ${hero.name}: read their story`}>
          <span className="dock__who">
            <span className="phone-label">Your hero</span>
            <span className="dock__name">{hero.name} <ChevronUpIcon size={14} /></span>
          </span>
          {stats}
        </button>
      ) : (
        <div className="dock__bar">
          <span className="dock__who"><span className="phone-label">{HEALTH_LABEL[resolved.theme]}</span></span>
          {stats}
        </div>
      )}
    </div>
  )
}

/** The hero's story and what they carry, sliding up from the dock. */
function HeroSheet({ open, state, onClose }: { open: boolean; state: GameState; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  const hero = state.character
  if (!hero) return null

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={`Your hero, ${hero.name}`}
      onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}  // a tap on the backdrop
    >
      <div className="sheet__body">
        <span className="sheet__grip" aria-hidden="true" />
        <div className="phone-label">Your hero</div>
        <h2 className="sheet__title">{hero.name}</h2>
        {hero.description && <p className="phone-text">{hero.description}</p>}
        <div className="sheet__section">
          <div className="phone-label">Carrying</div>
          {state.items.length > 0 ? (
            <ul className="sheet__items">{state.items.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul>
          ) : (
            <p className="sheet__empty">Nothing yet.</p>
          )}
        </div>
        <button type="button" className="sheet__close" onClick={onClose}>Close</button>
      </div>
    </dialog>
  )
}

function TurnBanner({ decider, mine, mode }: { decider: ResolvedContent['decider']; mine: boolean; mode: GameState['turn_mode'] }) {
  if (mine) return <div className="turn-banner turn-banner--mine" role="status">Your call</div>
  if (decider) return <div className="turn-banner" role="status"><strong>{decider.name}</strong> decides this one</div>
  return mode === 'pick' ? <div className="turn-banner" role="status">The storyteller will choose who decides</div> : null
}


interface VotePanelProps {
  vote: NonNullable<ResolvedContent['vote']>
  choices: string[]
  me: PlayerIdentity | null
  renderText: (text: string) => ReactNode
}

/** Voting on a phone: pick, confirm, then wait. Players see how many votes are left, never the tally. */
function VotePanel({ vote, choices, me, renderText }: VotePanelProps) {
  const secondsLeft = useCountdown(vote.ends_in)
  const [selected, setSelected] = useState<number | null>(null)
  const [cast, setCast] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // Reopened after voting: the server keeps one vote per player and takes the latest
  const [changing, setChanging] = useState(false)

  const eligible = !!me && vote.eligible.includes(me.id)
  const open = vote.open && secondsLeft !== 0
  const voted = !!me && vote.voted.includes(me.id) && !(changing && open)
  const canVote = eligible && !voted && open
  const remaining = vote.eligible.length - vote.voted.length

  async function submit() {
    if (!me || selected === null || sending) return
    setSending(true)
    setError(null)
    try {
      await api.castVote(me.token, selected)
      setCast(selected)
      setChanging(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your vote didn’t go through')
    } finally {
      setSending(false)
    }
  }

  const status = !open
    ? (remaining === 0 ? 'Every vote is in' : 'Time’s up: the votes are in')
    : `${remaining} ${remaining === 1 ? 'vote' : 'votes'} still to come`

  return (
    <div className="dealt vote" aria-live="polite">
      <div className="vote__status">
        <span>{status}</span>
        {open && secondsLeft !== null && <span className={`vote__clock ${secondsLeft <= 10 ? 'is-urgent' : ''}`}>{formatClock(secondsLeft)}</span>}
      </div>
      <span className="phone-label">
        {canVote ? 'Choose, then cast your vote' : voted ? 'Your vote is in' : eligible || !me ? 'The choices' : 'You joined mid-vote: you’ll vote in the next scene'}
      </span>
      {choices.map((text, i) => {
        const mine = (voted && cast === i) || (canVote && selected === i)
        const content = (
          <>
            <span className="dealt__numeral">{ROMAN[i] ?? i + 1}</span>
            <span>{renderText(text)}</span>
            {voted && cast === i && <span className="dealt__pick">Your vote</span>}
          </>
        )
        const props = { className: `dealt__card ${mine ? 'is-picked' : ''}`, style: { '--i': i } as React.CSSProperties }
        return canVote
          ? <button key={i} {...props} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}>{content}</button>
          : <div key={i} {...props}>{content}</div>
      })}
      {canVote && (
        <button type="button" className="join__button" disabled={selected === null || sending} onClick={submit}>
          {selected === null ? 'Pick a choice' : `Cast my vote for ${ROMAN[selected] ?? selected + 1}`}
        </button>
      )}
      {voted && open && cast !== null && (
        <button type="button" className="join__watch" onClick={() => { setSelected(cast); setChanging(true) }}>Change my vote</button>
      )}
      {error && <p className="join__error" role="alert">{error}</p>}
      <p className="phone__status" style={{ paddingTop: 6 }}>The storyteller sees how the table voted and makes the call.</p>
    </div>
  )
}
