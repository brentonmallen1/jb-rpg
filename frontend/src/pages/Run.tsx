import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import * as api from '../hooks/api'
import type { Story } from '../types'
import { Modal, ConfirmDialog, RulesModal, HPDisplay, StatsRow, ModeToggle } from '../components'
import '../styles/pages/run.css'

export default function Run() {
  const navigate = useNavigate()
  const {
    state,
    resolved,
    playerCount,
    toggleColorMode,
    colorMode,
    submitMadlib,
    makeChoice,
    goBack,
    finish,
    restart,
    stopSession,
    revealChoices,
    selectScene,
    selectOpeningChoice,
    isInitializing
  } = useGame()

  const [story, setStory] = useState<Story | null>(null)
  const [madlibInput, setMadlibInput] = useState('')
  const [showRules, setShowRules] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storytellerChoicesRevealed, setStorytellerChoicesRevealed] = useState(false)

  // Load story data
  useEffect(() => {
    if (state?.story_id) {
      api.getStory(state.story_id).then(setStory).catch(console.error)
    }
  }, [state?.story_id])

  // Reset storyteller's local reveal state when scene changes
  useEffect(() => {
    setStorytellerChoicesRevealed(false)
  }, [state?.current_scene_id])

  // Still connecting to SSE
  if (isInitializing) {
    return (
      <main className="container" style={{ textAlign: 'center', paddingTop: 'var(--space-xl)' }}>
        <p className="text-secondary">Connecting...</p>
      </main>
    )
  }

  // No active session (confirmed after SSE connected)
  if (!state) {
    return (
      <main className="container" style={{ textAlign: 'center', paddingTop: 'var(--space-xl)' }}>
        <h1>No Active Session</h1>
        <p className="text-secondary" style={{ marginBottom: 'var(--space-lg)' }}>
          Start a session from the library to begin playing.
        </p>
        <button className="btn" onClick={() => navigate('/')}>
          Go to Library
        </button>
      </main>
    )
  }

  // Get current madlib field
  const currentField = story?.madlib_template.fields[state.madlib_step]
  const madlibInputId = 'madlib-input'

  async function handleMadlibSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!madlibInput.trim()) return
    try {
      await submitMadlib(madlibInput.trim())
      setMadlibInput('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    }
  }

  async function handleChoice(index: number) {
    try {
      await makeChoice(index)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make choice')
    }
  }

  async function handleFinish(outcome: 'victory' | 'defeat') {
    try {
      await finish(outcome)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finish game')
    }
  }

  async function handleRestart() {
    try {
      await restart()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart')
    }
  }

  async function handleQuit() {
    setShowQuitConfirm(false)
    try {
      await stopSession()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session')
    }
  }

  function handleCopyLink() {
    if (!state) return
    navigator.clipboard.writeText(`${window.location.origin}/player/${state.session_id}`)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }

  return (
    <>
      <nav className="nav">
        <span className="nav__title">J&B's RPG</span>
        <div className="nav__actions">
          <span className="text-secondary text-sm" aria-live="polite">
            {playerCount} {playerCount === 1 ? 'player' : 'players'}
          </span>
          <button
            className="btn"
            onClick={() => setShowShare(true)}
          >
            Share
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => setShowQuitConfirm(true)}
          >
            Quit
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => setShowRules(true)}
            aria-label="Game rules"
          >
            ?
          </button>
          <ModeToggle colorMode={colorMode} onToggle={toggleColorMode} />
        </div>
      </nav>

      <main className="container">
        {/* Error Banner */}
        {error && (
          <div
            className="card"
            style={{
              background: 'var(--danger)',
              color: 'white',
              padding: 'var(--space-md)',
              marginBottom: 'var(--space-md)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            role="alert"
          >
            <span>{error}</span>
            <button
              className="btn btn--secondary"
              onClick={() => setError(null)}
              style={{ marginLeft: 'var(--space-md)' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Character Creation Phase */}
        {state.status === 'madlib_in_progress' && currentField && (
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <h1 style={{ marginBottom: 'var(--space-lg)' }}>Character Creation</h1>
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <p className="prose" style={{ lineHeight: 1.6 }}>
                {story?.madlib_template.prompt}
              </p>
            </div>
            <div className="text-secondary" style={{ marginBottom: 'var(--space-md)' }}>
              Field {state.madlib_step + 1} of {story?.madlib_template.fields.length}
            </div>
            <form onSubmit={handleMadlibSubmit}>
              <label
                htmlFor={madlibInputId}
                style={{ display: 'block', marginBottom: 'var(--space-sm)', fontSize: 'var(--text-xl)' }}
              >
                {currentField.label}
              </label>
              <input
                key={state.madlib_step}
                id={madlibInputId}
                type="text"
                value={madlibInput}
                onChange={e => setMadlibInput(e.target.value)}
                className="input"
                style={{ width: '100%', marginBottom: 'var(--space-md)' }}
                autoFocus
              />
              <button type="submit" className="btn" disabled={!madlibInput.trim()}>
                Submit
              </button>
            </form>
          </div>
        )}

        {/* Opening Scene Phase */}
        {state.status === 'opening_scene_active' && resolved && story?.opening_scene && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ marginBottom: 'var(--space-lg)', textAlign: 'center' }}>
              {story.opening_scene.title}
            </h1>
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <p className="prose">{resolved.scene_text}</p>
            </div>

            {story.opening_scene.choices.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {story.opening_scene.choices.map((choice, index) => (
                  <button
                    key={index}
                    className="btn"
                    onClick={() => selectOpeningChoice(index)}
                    style={{ width: '100%' }}
                  >
                    {choice.text}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <button className="btn" onClick={() => selectOpeningChoice(null)}>
                  Choose Your Path
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scene Selection Phase */}
        {state.status === 'awaiting_scene_selection' && story && (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ marginBottom: 'var(--space-lg)' }}>Select Next Scene</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {story.scenes.map(scene => {
                const historyEntry = state.history.find(h => h.scene_id === scene.id)
                const isPlayed = !!historyEntry
                const choiceMade = isPlayed ? scene.choices[historyEntry.choice_index] : null

                const getOutcomeDisplay = (choice: { kind: string; item_name?: string }) => {
                  if (choice.kind === 'damage') return '-1 HP'
                  if (choice.kind === 'item') return `Item: ${choice.item_name || 'Unknown'}`
                  if (choice.kind === 'level') return '+1 Level'
                  return ''
                }

                return (
                  <button
                    key={scene.id}
                    className="card"
                    onClick={() => selectScene(scene.id)}
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: scene.id === state.current_scene_id ? '2px solid var(--accent)' : undefined,
                      opacity: isPlayed ? 0.7 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                      <div className="font-semibold">{scene.title}</div>
                      {isPlayed && (
                        <span className="text-sm text-secondary" style={{ fontStyle: 'italic' }}>Played</span>
                      )}
                    </div>
                    {isPlayed && choiceMade ? (
                      <div className="text-sm" style={{ color: 'var(--accent)' }}>
                        {getOutcomeDisplay(choiceMade)}
                      </div>
                    ) : (
                      <div className="text-secondary text-sm">
                        {scene.base_text.slice(0, 100)}...
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Running Phase */}
        {state.status === 'running' && resolved && story && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {/* Character info */}
            {state.character && (
              <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="font-semibold" style={{ marginBottom: 'var(--space-xs)' }}>{state.character.name}</div>
                <div className="text-secondary">{resolved.character_description}</div>
              </div>
            )}

            {/* HP Display */}
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <HPDisplay hp={state.hp} />
            </div>

            {/* Stats */}
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <StatsRow level={state.level} itemCount={state.items.length} />
            </div>

            {/* Scene text */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <p className="prose">{resolved.scene_text}</p>
            </div>

            {/* Choices */}
            {(() => {
              const currentScene = story.scenes.find(s => s.id === state.current_scene_id)
              const getOutcomeLabel = (choice: { kind: string; item_name?: string }) => {
                if (choice.kind === 'damage') return '−1 HP'
                if (choice.kind === 'item') return choice.item_name || 'Item'
                if (choice.kind === 'level') return 'Level Up'
                return ''
              }

              // Storyteller hasn't revealed choices yet - show reveal button
              if (!storytellerChoicesRevealed && !state.shuffled_choices.length) {
                return (
                  <div style={{ textAlign: 'center' }}>
                    <button
                      className="btn"
                      onClick={async () => {
                        await revealChoices(false) // Shuffle but don't show to players
                        setStorytellerChoicesRevealed(true)
                      }}
                    >
                      Reveal Choices
                    </button>
                  </div>
                )
              }

              // Choices revealed to storyteller - show choice buttons + player controls
              return (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    {state.shuffled_choices.map((text, i) => {
                      const choice = currentScene?.choices.find(c => c.text === text)
                      return (
                        <button
                          key={i}
                          className={`btn choice-btn choice-btn--${choice?.kind ?? 'damage'}`}
                          onClick={() => handleChoice(i)}
                          style={{ padding: 'var(--space-md)', textAlign: 'left' }}
                        >
                          <div>{text}</div>
                          {choice && (
                            <div className="text-sm" style={{ opacity: 0.8, marginTop: 'var(--space-xs)' }}>
                              {getOutcomeLabel(choice)}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 'var(--space-md)' }}>
                    <button
                      className={`btn ${state.choices_revealed ? 'btn--secondary' : ''}`}
                      onClick={() => revealChoices(true)} // Show to players
                    >
                      {state.choices_revealed ? 'Remind Players of Choices' : 'Show Choices to Players'}
                    </button>
                  </div>
                </>
              )
            })()}

            {/* Back button */}
            {state.history.length > 0 && (
              <div style={{ marginTop: 'var(--space-lg)', textAlign: 'center' }}>
                <button className="btn btn--secondary" onClick={() => goBack()}>
                  Go Back
                </button>
              </div>
            )}
          </div>
        )}

        {/* Game Over Phase */}
        {state.status === 'game_over' && (
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            {state.outcome ? (
              <>
                <h1
                  className={state.outcome === 'victory' ? 'text-success' : 'text-danger'}
                  style={{ fontSize: 'var(--text-5xl)', marginBottom: 'var(--space-lg)' }}
                  aria-live="assertive"
                >
                  {state.outcome === 'victory' ? 'VICTORY!' : 'DEFEAT'}
                </h1>
                <div style={{ marginBottom: 'var(--space-xl)' }}>
                  <p>Level: {state.level}</p>
                  <p>Items: {state.items.length}</p>
                  {state.items.length > 0 && (
                    <p className="text-secondary">{state.items.join(', ')}</p>
                  )}
                </div>
                <button className="btn" onClick={handleRestart}>
                  Return to Library
                </button>
              </>
            ) : (
              <>
                <h1 style={{ marginBottom: 'var(--space-lg)' }}>Final Showdown!</h1>
                <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                  <p style={{ marginBottom: 'var(--space-md)' }}>
                    Roll a d20 and add {state.items.length} (items)
                  </p>
                  <p style={{ marginBottom: 'var(--space-md)' }}>
                    You have {state.level} roll attempt(s)
                  </p>
                  <p>Need 20+ total to win!</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
                  <button className="btn btn--success" onClick={() => handleFinish('victory')}>
                    Victory!
                  </button>
                  <button className="btn btn--danger" onClick={() => handleFinish('defeat')}>
                    Defeat
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Share Modal */}
      <Modal
        isOpen={showShare && !!state?.session_id}
        onClose={() => setShowShare(false)}
        title="Share with Players"
      >
        <p className="text-secondary" style={{ marginBottom: 'var(--space-md)' }}>
          Players can join using this link:
        </p>
        <input
          type="text"
          readOnly
          value={`${window.location.origin}/player/${state.session_id}`}
          aria-label="Player join link"
          style={{
            width: '100%',
            padding: 'var(--space-sm)',
            background: 'var(--bg-primary)',
            border: '1px solid var(--text-secondary)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            marginBottom: 'var(--space-md)',
            textAlign: 'center'
          }}
          onClick={e => (e.target as HTMLInputElement).select()}
        />
        <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
          <button className="btn" onClick={handleCopyLink}>
            {copyFeedback ? 'Copied!' : 'Copy Link'}
          </button>
          <button className="btn btn--secondary" onClick={() => setShowShare(false)}>
            Close
          </button>
        </div>
        {copyFeedback && (
          <p
            role="status"
            aria-live="polite"
            className="text-success text-sm"
            style={{ textAlign: 'center', marginTop: 'var(--space-sm)' }}
          >
            Link copied to clipboard
          </p>
        )}
      </Modal>

      {/* Quit Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showQuitConfirm}
        onConfirm={handleQuit}
        onCancel={() => setShowQuitConfirm(false)}
        title="End Session?"
        message="Are you sure you want to end the current session? All players will be disconnected."
        confirmText="End Session"
        variant="danger"
      />

      {/* Rules Modal */}
      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </>
  )
}
