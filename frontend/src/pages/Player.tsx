import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { useSSE } from '../hooks/useSSE'
import * as api from '../hooks/api'
import { Modal, RulesModal, HPDisplay, StatsRow, ModeToggle } from '../components'
import type { Story, Scene } from '../types'
import '../styles/pages/player.css'

export default function Player() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { toggleColorMode, colorMode, setTheme } = useGame()

  // Use our own SSE connection with the sessionId from URL
  const { state, storytellerConnected, playerCount } = useSSE({ sessionId })

  const [showRules, setShowRules] = useState(false)
  const [showCharacterModal, setShowCharacterModal] = useState(false)
  const [sessionInvalid, setSessionInvalid] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [story, setStory] = useState<Story | null>(null)

  // Validate session on mount
  useEffect(() => {
    if (!sessionId) {
      setIsValidating(false)
      return
    }

    api.getConfig()
      .then(config => {
        // If player has a sessionId in URL, it must match the active session
        // If no session exists OR session_id differs, the link is invalid
        if (!config.session_id || config.session_id !== sessionId) {
          setSessionInvalid(true)
        } else {
          setSessionInvalid(false)
        }
      })
      .catch(() => {
        // API error - assume valid and let SSE handle it
        setSessionInvalid(false)
      })
      .finally(() => setIsValidating(false))
  }, [sessionId])

  const [storyError, setStoryError] = useState(false)

  // Load story data and apply theme
  useEffect(() => {
    if (state?.story_id) {
      setStoryError(false)
      api.getStory(state.story_id).then((s) => {
        setStory(s)
        setTheme(s.theme)
      }).catch(() => {
        setStoryError(true)
      })
    }
  }, [state?.story_id, setTheme])

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
  if (isValidating) {
    return (
      <main className="player-layout">
        <div className="waiting-state">
          <p>Connecting...</p>
        </div>
      </main>
    )
  }

  // Session is invalid or expired
  if (sessionInvalid) {
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

  // Waiting for session to start
  if (!state) {
    return (
      <>
        <Toolbar onToggleMode={toggleColorMode} onShowRules={() => setShowRules(true)} colorMode={colorMode} />
        <main className="player-layout">
          <div className="waiting-state" aria-live="polite">
            <p>Waiting for storyteller to start...</p>
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
        {/* Story load error */}
        {storyError && (
          <div className="alert alert--warning mb-lg" role="alert">
            Could not load story details
          </div>
        )}

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

        {/* Revealed choices */}
        {state.choices_revealed && state.shuffled_indices.length > 0 && story && (() => {
          const currentScene = story.scenes.find((s: Scene) => s.id === state.current_scene_id)
          if (!currentScene) return null
          return (
            <div className="revealed-choices">
              <div className="revealed-choices-label text-sm text-secondary uppercase">
                Current Choices
              </div>
              {state.shuffled_indices.map((originalIndex, visualIndex) => {
                const choice = currentScene.choices[originalIndex]
                if (!choice) return null
                return (
                  <div key={visualIndex} className="revealed-choice">
                    {choice.display_text}
                  </div>
                )
              })}
            </div>
          )
        })()}

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
