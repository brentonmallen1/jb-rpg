import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import * as api from '../hooks/api'
import type { Story } from '../types'

export default function Run() {
  const navigate = useNavigate()
  const {
    state,
    resolved,
    connectedCount,
    toggleColorMode,
    submitMadlib,
    makeChoice,
    goBack,
    finish,
    restart,
    revealChoices,
    selectScene
  } = useGame()

  const [story, setStory] = useState<Story | null>(null)
  const [madlibInput, setMadlibInput] = useState('')
  const [showRules, setShowRules] = useState(false)

  // Load story data
  useEffect(() => {
    if (state?.story_id) {
      api.getStory(state.story_id).then(setStory).catch(console.error)
    }
  }, [state?.story_id])

  // No active session
  if (!state) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: 'var(--space-xl)' }}>
        <h1>No Active Session</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
          Start a session from the library to begin playing.
        </p>
        <button className="btn" onClick={() => navigate('/')}>
          Go to Library
        </button>
      </div>
    )
  }

  // Get current madlib field
  const currentField = story?.madlib_template.fields[state.madlib_step]

  async function handleMadlibSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!madlibInput.trim()) return
    await submitMadlib(madlibInput.trim())
    setMadlibInput('')
  }

  async function handleChoice(index: number) {
    await makeChoice(index)
  }

  async function handleFinish(outcome: 'victory' | 'defeat') {
    await finish(outcome)
  }

  async function handleRestart() {
    await restart()
    navigate('/')
  }

  return (
    <>
      <nav className="nav">
        <span className="nav__title">J&B's RPG</span>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {connectedCount} connected
          </span>
          <button
            className="btn btn--secondary"
            onClick={() => setShowRules(true)}
            style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.875rem' }}
          >
            Rules
          </button>
          <button
            className="btn btn--secondary mode-toggle"
            onClick={toggleColorMode}
            aria-label="Toggle light/dark mode"
          />
        </div>
      </nav>

      <div className="container">
        {/* Character Creation Phase */}
        {state.status === 'madlib_in_progress' && currentField && (
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <h1 style={{ marginBottom: 'var(--space-lg)' }}>Character Creation</h1>
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <p style={{ fontSize: '1.125rem', lineHeight: 1.6 }}>
                {story?.madlib_template.prompt}
              </p>
            </div>
            <div style={{ marginBottom: 'var(--space-md)', color: 'var(--text-secondary)' }}>
              Field {state.madlib_step + 1} of {story?.madlib_template.fields.length}
            </div>
            <form onSubmit={handleMadlibSubmit}>
              <label style={{ display: 'block', marginBottom: 'var(--space-sm)', fontSize: '1.25rem' }}>
                {currentField.label}
              </label>
              <input
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

        {/* Scene Selection Phase */}
        {state.status === 'awaiting_scene_selection' && story && (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h1 style={{ marginBottom: 'var(--space-lg)' }}>Select Next Scene</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {story.scenes.map(scene => (
                <button
                  key={scene.id}
                  className="card"
                  onClick={() => selectScene(scene.id)}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: scene.id === state.current_scene_id ? '2px solid var(--accent)' : undefined
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 'var(--space-xs)' }}>{scene.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    {scene.base_text.slice(0, 100)}...
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Running Phase */}
        {state.status === 'running' && resolved && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {/* Character info */}
            {state.character && (
              <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                <div style={{ fontWeight: 600, marginBottom: 'var(--space-xs)' }}>{state.character.name}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{resolved.character_description}</div>
              </div>
            )}

            {/* HP Display */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <span
                  key={i}
                  className={`hp-indicator ${i < state.hp ? 'hp-indicator--full' : 'hp-indicator--empty'}`}
                  style={{ width: '40px', height: '40px' }}
                />
              ))}
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-xl)', marginBottom: 'var(--space-lg)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent)' }}>{state.level}</div>
                <div style={{ color: 'var(--text-secondary)' }}>Level</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent)' }}>{state.items.length}</div>
                <div style={{ color: 'var(--text-secondary)' }}>Items</div>
              </div>
            </div>

            {/* Scene text */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <p style={{ fontSize: '1.125rem', lineHeight: 1.8 }}>{resolved.scene_text}</p>
            </div>

            {/* Choices */}
            {!state.choices_revealed ? (
              <div style={{ textAlign: 'center' }}>
                <button className="btn" onClick={() => revealChoices()}>
                  Reveal Choices
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {state.shuffled_choices.map((text, i) => {
                  const choice = resolved.choices.find(c => c.text === text)
                  return (
                    <button
                      key={i}
                      className={`btn choice-btn choice-btn--${choice?.kind}`}
                      onClick={() => handleChoice(i)}
                      style={{ padding: 'var(--space-md)', textAlign: 'left' }}
                    >
                      {text}
                    </button>
                  )
                })}
              </div>
            )}

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
                  style={{
                    fontSize: '3rem',
                    marginBottom: 'var(--space-lg)',
                    color: state.outcome === 'victory' ? 'var(--success)' : 'var(--danger)'
                  }}
                >
                  {state.outcome === 'victory' ? 'VICTORY!' : 'DEFEAT'}
                </h1>
                <div style={{ marginBottom: 'var(--space-xl)' }}>
                  <p>Level: {state.level}</p>
                  <p>Items: {state.items.length}</p>
                  {state.items.length > 0 && (
                    <p style={{ color: 'var(--text-secondary)' }}>{state.items.join(', ')}</p>
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
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-bg, rgba(0,0,0,0.8))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-lg)',
            zIndex: 1000
          }}
          onClick={() => setShowRules(false)}
        >
          <div
            style={{
              background: 'var(--bg-secondary)',
              padding: 'var(--space-xl)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '500px',
              width: '100%'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2>Game Rules</h2>
            <div style={{ lineHeight: 1.8 }}>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                <strong>Goal</strong><br />
                Reach the final scene and roll 20+ on a d20 to defeat the boss.
              </p>
              <p>
                <strong>Choice Outcomes</strong><br />
                <span style={{ color: 'var(--danger)' }}>Damage</span> — Lose 1 HP<br />
                <span style={{ color: 'var(--success)' }}>Item</span> — +1 to final roll<br />
                <span style={{ color: 'var(--warning)' }}>Level Up</span> — +1 roll attempt
              </p>
            </div>
            <button className="btn btn--secondary" style={{ marginTop: 'var(--space-lg)' }} onClick={() => setShowRules(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
