import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../context/useGame'
import { useSSE } from '../hooks/useSSE'
import * as api from '../hooks/api'
import { Modal, RulesModal, HPDisplay, StatsRow, ModeToggle } from '../components'
import '../styles/pages/player.css'

export default function Player() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { toggleColorMode, colorMode, setTheme } = useGame()

  // Use our own SSE connection with the sessionId from URL
  const { state, resolved, storytellerConnected, playerCount } = useSSE({ sessionId })

  const [showRules, setShowRules] = useState(false)
  const [showCharacterModal, setShowCharacterModal] = useState(false)
  const [sessionCheck, setSessionCheck] = useState<'checking' | 'valid' | 'invalid'>('checking')

  // Remember that we were in a game, so an empty state reads as "ended", not "waiting"
  const [joinedGame, setJoinedGame] = useState(false)
  if (state && !joinedGame) setJoinedGame(true)

  // Validate session on mount
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    api.checkSession(sessionId)
      .then(({ valid }) => { if (!cancelled) setSessionCheck(valid ? 'valid' : 'invalid') })
      // API error: assume valid and let SSE handle it
      .catch(() => { if (!cancelled) setSessionCheck('valid') })
    return () => { cancelled = true }
  }, [sessionId])

  // Apply the story's theme (sent by the server; players never load the story)
  const storyTheme = resolved?.theme
  useEffect(() => {
    if (storyTheme) setTheme(storyTheme)
  }, [storyTheme, setTheme])

  // If no sessionId in URL, show error
  if (!sessionId) {
    return (
      <main className="player-layout">
        <div className="waiting-state session-error">
          <h1>Session Link Required</h1>
          <p>Please use the link provided by your storyteller to join the game.</p>
        </div>
      </main>
    )
  }

  // Show loading while validating session
  if (sessionCheck === 'checking') {
    return (
      <main className="player-layout">
        <div className="waiting-state">
          <p>Connecting...</p>
        </div>
      </main>
    )
  }

  // Session is invalid or expired
  if (sessionCheck === 'invalid') {
    return (
      <main className="player-layout">
        <div className="waiting-state session-error">
          <h1>Session Not Found</h1>
          <p>This session link is invalid or has expired.</p>
          <p>Ask the storyteller for a new link.</p>
        </div>
      </main>
    )
  }

  // Session ended, or waiting for it to start
  if (!state) {
    return (
      <>
        <Toolbar onToggleMode={toggleColorMode} onShowRules={() => setShowRules(true)} colorMode={colorMode} />
        <main className="player-layout">
          <div className="waiting-state" aria-live="polite">
            {joinedGame ? (
              <>
                <h1>The session has ended</h1>
                <p>Thanks for playing. Ask the storyteller for a new link to join the next one.</p>
              </>
            ) : (
              <p>Waiting for storyteller to start...</p>
            )}
          </div>
        </main>
        <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
      </>
    )
  }

  // Character creation phase
  if (state.status === 'madlib_in_progress') {
    return (
      <>
        <Toolbar onToggleMode={toggleColorMode} onShowRules={() => setShowRules(true)} colorMode={colorMode} />
        <main className="player-layout">
          <div className="creation-header">
            <h1>Character Creation</h1>
            <p className="text-secondary italic">
              The storyteller is gathering character details...
            </p>
          </div>
          <div className="creation-footer">
            <p className="text-accent font-semibold" aria-live="polite">
              Your character is being created!
            </p>
          </div>
        </main>
        <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
      </>
    )
  }

  // Game over
  if (state.status === 'game_over') {
    return (
      <>
        <Toolbar onToggleMode={toggleColorMode} onShowRules={() => setShowRules(true)} colorMode={colorMode} />
        <main className="player-layout">
          {state.outcome && state.outcome_revealed ? (
            <div className="finale-section">
              <div
                className={`finale-outcome font-bold ${state.outcome === 'victory' ? 'text-success' : 'text-danger'}`}
                role="status"
                aria-live="assertive"
              >
                {state.outcome === 'victory' ? 'VICTORY!' : 'DEFEAT'}
              </div>
              <div className="stats-section">
                <StatsRow level={state.level} itemCount={state.items.length} />
              </div>
              {state.items.length > 0 && (
                <div className="finale-items text-secondary text-sm">
                  {state.items.join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div className="finale-section">
              <h2>Final Showdown!</h2>
              <p className="text-secondary">
                {state.outcome ? 'Awaiting results...' : 'Waiting for the dice roll...'}
              </p>
              <div className="finale-roll-info">
                <p>Roll a d20 + {state.items.length} (items)</p>
                <p>You have {state.level} attempt(s)</p>
                <p>Need 20+ to win!</p>
              </div>
            </div>
          )}
        </main>
        <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
      </>
    )
  }

  // Running game (also handles awaiting_scene_selection - players see normal view)
  return (
    <>
      <Toolbar onToggleMode={toggleColorMode} onShowRules={() => setShowRules(true)} colorMode={colorMode} />
      <main className="player-layout">
        {/* Character section - now a proper button */}
        {state.character && (
          <button
            type="button"
            className="character-section"
            onClick={() => setShowCharacterModal(true)}
            aria-label={`View details for ${state.character.name}`}
          >
            <div className="character-name font-bold truncate">
              {state.character.name}
            </div>
            <div className="character-description-preview text-secondary line-clamp-2">
              {state.character.description}
            </div>
          </button>
        )}

        {/* HP Display */}
        <div className="hp-section">
          <HPDisplay hp={state.hp} indicatorSize={48} showLabel />
        </div>

        {/* Stats */}
        <div className="stats-section">
          <StatsRow level={state.level} itemCount={state.items.length} size="large" />
        </div>

        {/* Items list */}
        {state.items.length > 0 && (
          <ul className="items-list">
            {state.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}

        {/* Revealed choices (display text only; outcomes never reach players) */}
        {resolved && resolved.visible_choices.length > 0 && (
          <div className="revealed-choices">
            <div className="revealed-choices-label text-sm text-secondary uppercase">
              Current Choices
            </div>
            {resolved.visible_choices.map((text, i) => (
              <div key={i} className="revealed-choice">
                {text}
              </div>
            ))}
          </div>
        )}

        {/* Connection status */}
        <ConnectionStatus storytellerConnected={storytellerConnected} playerCount={playerCount} />
      </main>

      {/* Character Modal */}
      <Modal
        isOpen={showCharacterModal && !!state.character}
        onClose={() => setShowCharacterModal(false)}
        title={state.character?.name || 'Character'}
      >
        <p className="character-modal-description text-secondary">{state.character?.description}</p>
        <button className="btn btn--secondary character-modal-close" onClick={() => setShowCharacterModal(false)}>
          Close
        </button>
      </Modal>

      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </>
  )
}

function Toolbar({ onToggleMode, onShowRules, colorMode }: { onToggleMode: () => void; onShowRules: () => void; colorMode: 'light' | 'dark' }) {
  return (
    <div className="player-toolbar">
      <button
        className="btn btn--secondary"
        onClick={onShowRules}
        aria-label="Game rules"
      >
        ?
      </button>
      <ModeToggle colorMode={colorMode} onToggle={onToggleMode} />
    </div>
  )
}

function ConnectionStatus({ storytellerConnected, playerCount }: { storytellerConnected: boolean; playerCount: number }) {
  return (
    <div className="connection-status text-secondary text-sm" aria-live="polite">
      {storytellerConnected ? (
        <span>{playerCount} {playerCount === 1 ? 'player' : 'players'}</span>
      ) : (
        <span className="text-warning">Storyteller disconnected</span>
      )}
    </div>
  )
}
