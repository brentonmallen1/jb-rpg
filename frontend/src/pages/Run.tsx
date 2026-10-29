import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/useGame'
import * as api from '../hooks/api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useHotkeys } from '../hooks/useHotkeys'
import { playSting, useAmbience, useSoundEnabled } from '../hooks/useSoundscape'
import { useMoments } from '../hooks/useMoments'
import { capLevel } from '../hooks/useEffectsLevel'
import type { GameState, PlayerRef, Story } from '../types'
import { Modal, ConfirmDialog, RulesModal, PageMessage, MomentLayer, Atmosphere } from '../components'
import { BookIcon, CloseIcon, FlashIcon, FlashOffIcon, LinkIcon, LockIcon, MoonIcon, PresentIcon, SoundOffIcon, SoundOnIcon, SunIcon } from '../components/Icons'
import { storyProgress } from '../lib/story'
import { moodFor } from '../lib/themes'
import { MadlibStep } from './run/MadlibStep'
import { CharacterReveal } from './run/CharacterReveal'
import { OpeningScene } from './run/OpeningScene'
import { SceneSelect } from './run/SceneSelect'
import { SceneView } from './run/SceneView'
import { GameOver } from './run/GameOver'
import { PartyRail } from './run/PartyRail'
import { InviteCard, QrCode } from './run/InviteCard'
import { useCopyLink, usePlayerLink } from '../hooks/usePlayerLink'
import '../styles/stage.css'

const PRESENTATION_KEY = 'jb_rpg_presentation'
const INVITE_HIDDEN_KEY = 'jb_rpg_invite_hidden'

/** The audio that should loop right now: the scene's own ambience, else the story's. */
function ambienceFor(story: Story | null, state: GameState | null): string | null {
  if (!story || !state) return null
  const scene = story.scenes.find(s => s.id === state.current_scene_id)
  const own = ['running', 'game_over'].includes(state.status) ? scene?.ambience : undefined
  const name = own === 'none' ? null : own || story.sound?.ambience || null
  return name ? api.audioUrl(story.id, name) : null
}

function hasSound(story: Story | null): boolean {
  return !!story && (!!story.sound?.ambience || Object.keys(story.sound?.stings ?? {}).length > 0 || story.scenes.some(s => s.ambience && s.ambience !== 'none'))
}

function readPresentation(): boolean {
  try {
    return localStorage.getItem(PRESENTATION_KEY) === 'on'
  } catch {
    return false
  }
}

/** The session whose invite card the storyteller hid (the card comes back for the next game). */
function readInviteHidden(): string | null {
  try {
    return sessionStorage.getItem(INVITE_HIDDEN_KEY)
  } catch {
    return null
  }
}

export default function Run() {
  const navigate = useNavigate()
  const {
    state, resolved, playerCount, toggleColorMode, colorMode, setTheme,
    endSession, resumeSession, isInitializing, isStoryteller, isValidatingToken, sessionElsewhere, playersOnline, voteTally,
  } = useGame()
  const { run, pending, error, clearError } = useAsyncAction()
  const { current: moment, done: momentDone } = useMoments(state, resolved)

  const [story, setStory] = useState<Story | null>(null)
  const [presentation, setPresentation] = useState(readPresentation)
  const [showRules, setShowRules] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [inviteHiddenFor, setInviteHiddenFor] = useState(readInviteHidden)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<PlayerRef | null>(null)
  const sound = useSoundEnabled()
  useAmbience(ambienceFor(story, state), sound.enabled && hasSound(story))

  // A moment's sting plays as the moment starts
  const momentId = moment?.id
  const sting = moment && story?.sound?.stings[moment.type]
  useEffect(() => {
    if (sound.enabled && sting && story) playSting(api.audioUrl(story.id, sting))
  }, [momentId, sting, sound.enabled, story])

  // The session's own copy of the story: edits made after starting don't affect this game
  const sessionId = state?.session_id
  useEffect(() => {
    if (!sessionId || !isStoryteller) return
    let cancelled = false
    api.getSessionStory()
      .then(s => { if (!cancelled) setStory(s) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [sessionId, isStoryteller])

  // The whole stage wears the story's theme
  const storyTheme = story?.theme
  useEffect(() => {
    if (storyTheme) setTheme(storyTheme)
  }, [storyTheme, setTheme])

  const togglePresentation = useCallback(() => {
    setPresentation(on => {
      const next = !on
      try {
        localStorage.setItem(PRESENTATION_KEY, next ? 'on' : 'off')
      } catch {
        // per-device preference only
      }
      // Full screen on a TV; ignore browsers that refuse
      if (next && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
      if (!next && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      return next
    })
  }, [])

  useHotkeys({ p: togglePresentation }, !!state && isStoryteller)

  if (isInitializing || isValidatingToken) {
    return <PageMessage message="Connecting..." />
  }

  if (!state && !sessionElsewhere) {
    return (
      <PageMessage
        title="No Active Session"
        message="Start a session from the library to begin playing."
        action={<button className="btn" onClick={() => navigate('/')}>Go to Library</button>}
      />
    )
  }

  if (!state || !isStoryteller) {
    return (
      <PageMessage
        title="Session running elsewhere"
        message="This game is being run from another tab or device. Take over to continue it here."
        action={
          <div className="btn-group">
            <button className="btn btn--secondary" onClick={() => navigate('/')}>Go to Library</button>
            <button className="btn" onClick={() => run(resumeSession, 'Failed to take over')}>Take over</button>
          </div>
        }
      />
    )
  }

  async function returnToLibrary() {
    if (await run(endSession, 'Failed to end session')) navigate('/')
  }

  function renderStatus(state: GameState, story: Story) {
    switch (state.status) {
      case 'madlib_in_progress':
        return <MadlibStep state={state} story={story} run={run} pending={pending} />
      case 'character_reveal':
        return state.character ? <CharacterReveal character={state.character} crest={state.crest} emblem={state.emblem} theme={story.theme} run={run} /> : null
      case 'opening_scene_active':
        return story.opening_scene && resolved
          ? <OpeningScene scene={story.opening_scene} sceneText={resolved.scene_text ?? ''} run={run} />
          : null
      case 'awaiting_scene_selection':
        return <SceneSelect state={state} story={story} run={run} />
      case 'running':
        return resolved ? (
          <SceneView key={state.current_scene_id} state={state} resolved={resolved} story={story} run={run} pending={pending} voteTally={voteTally} />
        ) : null
      case 'game_over':
        return <GameOver state={state} resolved={resolved} story={story} run={run} onReturnToLibrary={returnToLibrary} />
    }
  }

  // The TV plays full effects unless the table asked for no flashing; the private view stays subtle
  const effectsLevel = capLevel(presentation ? 'full' : 'subtle', state.no_flashing)
  const toggleFlashing = () => run(() => api.setNoFlashing(!state.no_flashing), 'Could not change the effects')

  const steps = story ? storyProgress(story, state) : []
  const sceneNumber = steps.filter(s => s.status !== 'upcoming').length
  const showProgress = story && ['running', 'awaiting_scene_selection', 'game_over'].includes(state.status)
  const showParty = !['madlib_in_progress', 'character_reveal'].includes(state.status)
  // The invite sits on the stage until the first choice is made, unless hidden
  const showInvite = state.history.length === 0 && state.status !== 'game_over' && inviteHiddenFor !== state.session_id
  function hideInvite() {
    setInviteHiddenFor(state!.session_id)
    try {
      sessionStorage.setItem(INVITE_HIDDEN_KEY, state!.session_id)
    } catch {
      // per-tab convenience only
    }
  }

  return (
    <div className={`stage ${presentation ? 'stage--presentation' : ''}`}>
      {story && (
        <Atmosphere
          theme={story.theme}
          mood={moodFor(story.theme, resolved?.mood, resolved?.mood_seed)}
          level={effectsLevel}
          madness={1 - state.hp / Math.max(story.settings.starting_hp, 1)}
        />
      )}
      <header className="stage__bar">
        <div className="stage__story">
          <span className="stage__story-title">{story?.title ?? 'Loading…'}</span>
          {showProgress && (
            <span className="stage-label storyteller-only">Scene {Math.max(sceneNumber, 1)} of {steps.length}</span>
          )}
        </div>

        {showProgress && (
          <ol className="progress-rail storyteller-only" aria-label="Story progress">
            {steps.map(step => step.finale && step.status === 'upcoming' ? (
              <li key={step.id} className="is-finale" title={`${step.name} (finale)`}><LockIcon size={14} label="Finale" /></li>
            ) : (
              <li key={step.id} className={`is-${step.status}`} title={`${step.name}: ${step.status}`} />
            ))}
          </ol>
        )}

        <div className="stage__tools">
          <span className={`stage__players storyteller-only ${playerCount > 0 ? 'stage__players--present' : ''}`} aria-live="polite">
            {playerCount} {playerCount === 1 ? 'player' : 'players'}
          </span>
          {hasSound(story) && (
            <button className="icon-btn" onClick={sound.toggle} aria-pressed={sound.enabled} aria-label={sound.enabled ? 'Turn sound off' : 'Turn sound on'} title={sound.enabled ? 'Sound on' : 'Sound off'}>
              {sound.enabled ? <SoundOnIcon /> : <SoundOffIcon />}
            </button>
          )}
          <button
            className="icon-btn"
            onClick={toggleFlashing}
            aria-pressed={state.no_flashing}
            aria-label={state.no_flashing ? 'No flashing on any screen: turn flashing effects back on' : 'Turn off flashing effects on every screen'}
            title={state.no_flashing ? 'No flashing (all screens)' : 'Flashing effects on'}
          >
            {state.no_flashing ? <FlashOffIcon /> : <FlashIcon />}
          </button>
          <button className="icon-btn" onClick={togglePresentation} aria-pressed={presentation} aria-label="Presentation mode (P)" title="Presentation mode (P)">
            <PresentIcon />
          </button>
          <button className="s-btn s-btn--ghost stage__invite storyteller-only" onClick={() => setShowShare(true)} title="Invite players">
            <LinkIcon size={16} /> Invite
          </button>
          <button className="icon-btn" onClick={toggleColorMode} aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}>
            {colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="icon-btn" onClick={() => setShowRules(true)} aria-label="Rules" title="Rules">
            <BookIcon />
          </button>
          <button className="icon-btn storyteller-only" onClick={() => setShowQuitConfirm(true)} aria-label="End session" title="End session">
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className={`stage__body ${showParty ? '' : 'stage__body--solo'}`}>
        {showParty && story && (
          <PartyRail
            state={state}
            theme={story.theme}
            maxHp={story.settings.starting_hp}
            characterDescription={resolved?.character_description}
            decider={resolved?.decider}
            playersOnline={playersOnline}
            onRemovePlayer={p => setRemoveTarget(p)}
            votedIds={resolved?.vote?.voted}
          />
        )}
        <main className="stage__main">
          {error && (
            <div className="stage-error" role="alert">
              <span>{error}</span>
              <button className="s-btn s-btn--ghost" onClick={clearError}>Dismiss</button>
            </div>
          )}
          {showInvite && (
            <InviteCard sessionId={state.session_id} playerCount={playerCount} onDismiss={hideInvite} />
          )}
          {story && renderStatus(state, story)}
        </main>
      </div>

      <MomentLayer moment={moment} theme={story?.theme ?? 'modern'} level={effectsLevel} onDone={momentDone} />

      <ShareModal isOpen={showShare} sessionId={state.session_id} onClose={() => setShowShare(false)} />

      <ConfirmDialog
        isOpen={showQuitConfirm}
        onConfirm={() => { setShowQuitConfirm(false); returnToLibrary() }}
        onCancel={() => setShowQuitConfirm(false)}
        title="End Session?"
        message="Are you sure you want to end the current session? All players will be disconnected."
        confirmText="End Session"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={removeTarget !== null}
        onConfirm={() => {
          const target = removeTarget
          setRemoveTarget(null)
          if (target) run(() => api.removePlayer(target.id), 'Failed to remove the player')
        }}
        onCancel={() => setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name}?`}
        message="They leave the turn order. They can join again from the invite link."
        confirmText="Remove"
        variant="danger"
      />

      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </div>
  )
}

function ShareModal({ isOpen, sessionId, onClose }: { isOpen: boolean; sessionId: string; onClose: () => void }) {
  const link = usePlayerLink(sessionId)
  const { copied, copy, canCopyQr, qrCopied, copyQr } = useCopyLink(link)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite players">
      <p className="text-secondary mb-md">Players scan this with their phone camera, or open the link:</p>
      <div className="share-qr"><QrCode text={link} size={200} /></div>
      <input
        type="text"
        readOnly
        value={link}
        aria-label="Player join link"
        className="input text-center mb-md"
        onClick={e => (e.target as HTMLInputElement).select()}
      />
      <div className="btn-group">
        <button className="btn" onClick={copy}>{copied ? 'Copied!' : 'Copy Link'}</button>
        {canCopyQr && <button className="btn btn--secondary" onClick={copyQr}>{qrCopied ? 'Copied!' : 'Copy QR code'}</button>}
        <button className="btn btn--secondary" onClick={onClose}>Close</button>
      </div>
      {copied && (
        <p role="status" aria-live="polite" className="text-success text-sm text-center mt-sm">
          Link copied to clipboard
        </p>
      )}
    </Modal>
  )
}
