import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/useGame'
import * as api from '../hooks/api'
import { useAsyncAction } from '../hooks/useAsyncAction'
import type { Story } from '../types'
import { Modal, ConfirmDialog, RulesModal, ModeToggle, PageMessage } from '../components'
import { getThemeVars } from '../styles/themeVars'
import { MadlibStep } from './run/MadlibStep'
import { CharacterReveal } from './run/CharacterReveal'
import { OpeningScene } from './run/OpeningScene'
import { SceneSelect } from './run/SceneSelect'
import { SceneView } from './run/SceneView'
import { GameOver } from './run/GameOver'
import '../styles/pages/run.css'

export default function Run() {
  const navigate = useNavigate()
  const {
    state, resolved, playerCount, toggleColorMode, colorMode, setTheme,
    endSession, resumeSession, isInitializing, isStoryteller, isValidatingToken, sessionElsewhere,
  } = useGame()
  const { run, pending, error, clearError } = useAsyncAction()

  const [story, setStory] = useState<Story | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)

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

  // The storyteller's chrome uses the modern theme; the story's theme colours the stats
  useEffect(() => {
    setTheme('modern')
  }, [setTheme])

  useEffect(() => {
    if (story?.theme && story.theme !== 'modern') {
      import(`../styles/themes/${story.theme}.css`)
    }
  }, [story?.theme])

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

  function renderStatus() {
    if (!state || !story) return null
    switch (state.status) {
      case 'madlib_in_progress':
        return <MadlibStep state={state} story={story} run={run} pending={pending} />
      case 'character_reveal':
        return state.character ? <CharacterReveal character={state.character} run={run} /> : null
      case 'opening_scene_active':
        return story.opening_scene && resolved
          ? <OpeningScene scene={story.opening_scene} sceneText={resolved.scene_text} run={run} />
          : null
      case 'awaiting_scene_selection':
        return (
          <SceneSelect
            state={state}
            story={story}
            colorMode={colorMode}
            run={run}
            onError={message => run(() => Promise.reject(new Error(message)))}
          />
        )
      case 'running':
        return resolved ? (
          <SceneView
            key={state.current_scene_id}
            state={state}
            resolved={resolved}
            story={story}
            colorMode={colorMode}
            run={run}
            pending={pending}
          />
        ) : null
      case 'game_over':
        return <GameOver state={state} resolved={resolved} run={run} onReturnToLibrary={returnToLibrary} />
    }
  }

  return (
    <>
      <nav className={`nav ${story?.theme || 'modern'}`} style={story ? getThemeVars(story.theme, colorMode) : undefined}>
        <span className="nav__title">J&B's RPG</span>
        <div className="nav__actions">
          <span className="text-secondary text-sm" aria-live="polite">
            {playerCount} {playerCount === 1 ? 'player' : 'players'}
          </span>
          <button className="btn" onClick={() => setShowShare(true)}>Share</button>
          <button className="btn btn--secondary" onClick={() => setShowQuitConfirm(true)}>Quit</button>
          <button className="btn btn--secondary" onClick={() => setShowRules(true)} aria-label="Game rules">?</button>
          <ModeToggle colorMode={colorMode} onToggle={toggleColorMode} />
        </div>
      </nav>

      <main className="container">
        {error && (
          <div className="alert alert--danger mb-md" role="alert">
            <span>{error}</span>
            <button className="btn btn--secondary" onClick={clearError} style={{ marginLeft: 'var(--space-md)' }}>
              Dismiss
            </button>
          </div>
        )}
        {renderStatus()}
      </main>

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

      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </>
  )
}

function ShareModal({ isOpen, sessionId, onClose }: { isOpen: boolean; sessionId: string; onClose: () => void }) {
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // BASE_URL (behind a reverse proxy) wins over the address the storyteller happens to use
  useEffect(() => {
    if (!isOpen) return
    api.getConfig().then(c => setBaseUrl(c.base_url)).catch(() => setBaseUrl(null))
  }, [isOpen])

  const link = `${(baseUrl || window.location.origin).replace(/\/$/, '')}/player/${sessionId}`

  function copy() {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share with Players">
      <p className="text-secondary mb-md">Players can join using this link:</p>
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
