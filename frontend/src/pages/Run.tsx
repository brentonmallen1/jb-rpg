import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import * as api from '../hooks/api'
import type { Story, Choice, Scene, HistoryEntry, ThemeName } from '../types'
import { Modal, ConfirmDialog, RulesModal, HPDisplay, StatsRow, ModeToggle } from '../components'
import { getThemeVars } from '../styles/themeVars'
import '../styles/pages/run.css'

export default function Run() {
  const navigate = useNavigate()
  const {
    state,
    resolved,
    playerCount,
    toggleColorMode,
    colorMode,
    setTheme,
    submitMadlib,
    proceedFromCharacter,
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
  const [pendingChoice, setPendingChoice] = useState<{ visualIndex: number; choice: Choice } | null>(null)
  const [pendingRevisit, setPendingRevisit] = useState<{ sceneId: string; sceneTitle: string; outcome: string } | null>(null)
  const [pendingOutcome, setPendingOutcome] = useState<{ outcome: 'victory' | 'defeat'; text: string } | null>(null)

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

  // Force modern theme for storyteller's Run page
  useEffect(() => {
    setTheme('modern')
  }, [setTheme])

  // Load story's theme CSS for themed stats display
  useEffect(() => {
    if (story?.theme && story.theme !== 'modern') {
      import(`../styles/themes/${story.theme}.css`)
    }
  }, [story?.theme])

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

  function handleChoice(visualIndex: number, choice: Choice) {
    // Show confirmation modal instead of immediately making choice
    setPendingChoice({ visualIndex, choice })
  }

  async function confirmChoice() {
    if (!pendingChoice) return
    try {
      await makeChoice(pendingChoice.visualIndex)
      setPendingChoice(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make choice')
    }
  }

  function cancelChoice() {
    setPendingChoice(null)
  }

  async function handleFinish(outcome: 'victory' | 'defeat') {
    try {
      await finish(outcome)
      setError(null)
      setPendingOutcome(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finish game')
    }
  }

  function showFinaleOutcome(outcome: 'victory' | 'defeat') {
    // Use resolved text from backend (has variable injection applied)
    const text = outcome === 'victory' ? resolved?.victory_text : resolved?.defeat_text
    setPendingOutcome({ outcome, text: text || '' })
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
      <nav
        className={`nav ${story?.theme || 'modern'}`}
        style={story ? getThemeVars(story.theme as ThemeName, colorMode) : undefined}
      >
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
              {currentField.hint && (
                <div className="text-secondary text-sm" style={{ marginBottom: 'var(--space-sm)', fontStyle: 'italic' }}>
                  ({currentField.hint})
                </div>
              )}
              <div className="text-secondary text-sm" style={{ marginBottom: 'var(--space-sm)' }}>
                → fills <code style={{ background: 'var(--bg-secondary)', padding: '0 4px', borderRadius: '4px' }}>{'{' + currentField.key + '}'}</code>
              </div>
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

        {/* Character Reveal Phase */}
        {state.status === 'character_reveal' && state.character && (
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <h1 style={{ marginBottom: 'var(--space-lg)' }}>Read to Players</h1>
            <div className="card" style={{ marginBottom: 'var(--space-lg)', textAlign: 'left' }}>
              <div className="font-semibold" style={{ marginBottom: 'var(--space-sm)', fontSize: 'var(--text-xl)' }}>
                {state.character.name}
              </div>
              <p className="prose" style={{ lineHeight: 1.6 }}>
                {state.character.description}
              </p>
            </div>
            <button className="btn" onClick={() => proceedFromCharacter()}>
              Continue
            </button>
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
            <h1 style={{ marginBottom: 'var(--space-md)' }}>Select Next Scene</h1>

            {/* Player Stats (themed) */}
            <div className={story.theme} style={getThemeVars(story.theme as ThemeName, colorMode)}>
              <div style={{ marginBottom: 'var(--space-lg)', display: 'flex', justifyContent: 'center', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
                <HPDisplay hp={state.hp} />
                <StatsRow level={state.level} itemCount={state.items.length} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {story.scenes.map(scene => {
                const historyEntry = state.history.find(h => h.scene_id === scene.id)
                const isPlayed = !!historyEntry
                const choiceMade = isPlayed ? scene.choices[historyEntry.choice_index] : null
                const isFinale = scene.is_finale
                const nonFinaleScenes = story.scenes.filter((s: Scene) => !s.is_finale)
                const playedIds = new Set(state.history.map((h: HistoryEntry) => h.scene_id))
                const allNonFinalesPlayed = nonFinaleScenes.every((s: Scene) => playedIds.has(s.id))
                const isFinaleDisabled = isFinale && !allNonFinalesPlayed

                const getOutcomeDisplay = (choice: { kind: string; item_name?: string }) => {
                  if (choice.kind === 'damage') return '-1 HP'
                  if (choice.kind === 'item') return `Item: ${choice.item_name || 'Unknown'}`
                  if (choice.kind === 'level') return '+1 Level'
                  return ''
                }

                const handleSceneClick = () => {
                  if (isFinaleDisabled) {
                    setError('Complete all scenes before accessing the finale')
                    return
                  }
                  if (isPlayed && choiceMade) {
                    // Show confirmation for revisit
                    setPendingRevisit({
                      sceneId: scene.id,
                      sceneTitle: scene.display_name || scene.title,
                      outcome: getOutcomeDisplay(choiceMade)
                    })
                  } else {
                    selectScene(scene.id)
                  }
                }

                return (
                  <button
                    key={scene.id}
                    className="card"
                    onClick={handleSceneClick}
                    style={{
                      textAlign: 'left',
                      cursor: isFinaleDisabled ? 'not-allowed' : 'pointer',
                      border: scene.id === state.current_scene_id ? '2px solid var(--accent)' : undefined,
                      opacity: isFinaleDisabled ? 0.4 : isPlayed ? 0.7 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {scene.display_name || scene.title}
                        {isFinale && <span className="text-sm text-secondary"> (Finale)</span>}
                      </div>
                      {isPlayed && (
                        <span className="text-sm text-secondary" style={{ fontStyle: 'italic' }}>Played</span>
                      )}
                      {isFinaleDisabled && (
                        <span className="text-sm text-secondary" style={{ fontStyle: 'italic' }}>🔒</span>
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

            {/* HP Display & Stats (themed) */}
            <div className={story.theme} style={getThemeVars(story.theme as ThemeName, colorMode)}>
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <HPDisplay hp={state.hp} />
              </div>
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <StatsRow level={state.level} itemCount={state.items.length} />
              </div>
            </div>

            {/* Scene text */}
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <p className="prose">{resolved.scene_text}</p>
            </div>

            {/* Choices or Finale */}
            {(() => {
              const currentScene = story.scenes.find(s => s.id === state.current_scene_id)
              const getOutcomeLabel = (choice: { kind: string; item_name?: string }) => {
                if (choice.kind === 'damage') return '−1 HP'
                if (choice.kind === 'item') return choice.item_name || 'Item'
                if (choice.kind === 'level') return 'Level Up'
                return ''
              }

              // Finale scene - show setup text and outcome buttons instead of choices
              if (currentScene?.is_finale) {
                return (
                  <div style={{ textAlign: 'center' }}>
                    {currentScene.finale_setup_text && (
                      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                        <p className="prose">{currentScene.finale_setup_text}</p>
                      </div>
                    )}
                    <div style={{ marginBottom: 'var(--space-lg)' }}>
                      <p className="text-secondary">Roll a d20 and add {state.items.length} (items)</p>
                      <p className="text-secondary">You have {state.level} roll attempt(s)</p>
                      <p className="text-secondary">Need 20+ total to win!</p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
                      <button className="btn btn--success" onClick={() => showFinaleOutcome('victory')}>
                        Victory!
                      </button>
                      <button className="btn btn--danger" onClick={() => showFinaleOutcome('defeat')}>
                        Defeat
                      </button>
                    </div>
                  </div>
                )
              }

              // Storyteller hasn't revealed choices yet - show reveal button
              if (!storytellerChoicesRevealed && !state.shuffled_indices.length) {
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
                    {state.shuffled_indices.map((originalIndex: number, visualIndex: number) => {
                      const choice = currentScene?.choices[originalIndex]
                      if (!choice) return null
                      return (
                        <button
                          key={visualIndex}
                          className={`btn choice-btn choice-btn--${choice.kind}`}
                          onClick={() => handleChoice(visualIndex, choice)}
                          style={{ padding: 'var(--space-md)', textAlign: 'left' }}
                        >
                          <div>{choice.display_text}</div>
                          <div className="text-sm" style={{ opacity: 0.8, marginTop: 'var(--space-xs)' }}>
                            {getOutcomeLabel(choice)}
                          </div>
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

            {/* Back button - only for linear stories, not for non-linear (scene replay is done from scene selection) */}
            {state.history.length > 0 && !story?.settings.non_linear && (
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
                {!state.outcome_revealed ? (
                  <button
                    className="btn btn--success"
                    onClick={async () => {
                      try {
                        await api.revealOutcome()
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to reveal outcome')
                      }
                    }}
                  >
                    Reveal to Players
                  </button>
                ) : (
                  <button className="btn" onClick={handleRestart}>
                    Return to Library
                  </button>
                )}
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
                  <button className="btn btn--success" onClick={() => showFinaleOutcome('victory')}>
                    Victory!
                  </button>
                  <button className="btn btn--danger" onClick={() => showFinaleOutcome('defeat')}>
                    Defeat
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Finale Outcome Modal */}
      <Modal
        isOpen={!!pendingOutcome}
        onClose={() => setPendingOutcome(null)}
        title={pendingOutcome?.outcome === 'victory' ? 'Victory!' : 'Defeat'}
      >
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          {pendingOutcome?.text ? (
            <p className="prose">{pendingOutcome.text}</p>
          ) : (
            <p className="text-secondary">No text provided for this outcome.</p>
          )}
        </div>
        <p className="text-secondary text-sm" style={{ marginBottom: 'var(--space-lg)' }}>
          Read the text above to your players, then click Continue.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
          <button className="btn btn--secondary" onClick={() => setPendingOutcome(null)}>
            Cancel
          </button>
          <button
            className={pendingOutcome?.outcome === 'victory' ? 'btn btn--success' : 'btn btn--danger'}
            onClick={() => pendingOutcome && handleFinish(pendingOutcome.outcome)}
          >
            Continue
          </button>
        </div>
      </Modal>

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

      {/* Scene Revisit Confirmation Modal */}
      <ConfirmDialog
        isOpen={!!pendingRevisit}
        onConfirm={async () => {
          if (pendingRevisit) {
            try {
              await selectScene(pendingRevisit.sceneId, true)
              setPendingRevisit(null)
              setError(null)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to revisit scene')
            }
          }
        }}
        onCancel={() => setPendingRevisit(null)}
        title="Revisit Scene?"
        message={pendingRevisit ? `Revisiting "${pendingRevisit.sceneTitle}" will revert: ${pendingRevisit.outcome}` : ''}
        confirmText="Revisit"
        variant="default"
      />

      {/* Choice Confirmation Modal */}
      <Modal
        isOpen={!!pendingChoice}
        onClose={cancelChoice}
        title="Choice Result"
      >
        {pendingChoice && (
          <>
            <div
              className={`text-${pendingChoice.choice.kind === 'damage' ? 'danger' : pendingChoice.choice.kind === 'item' ? 'success' : 'warning'}`}
              style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-md)', textAlign: 'center' }}
            >
              {pendingChoice.choice.kind === 'damage' && '−1 HP'}
              {pendingChoice.choice.kind === 'item' && (pendingChoice.choice.item_name || 'Item Gained')}
              {pendingChoice.choice.kind === 'level' && 'Level Up!'}
            </div>
            <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
              <p className="prose" style={{ lineHeight: 1.6 }}>
                {pendingChoice.choice.result_text}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center' }}>
              <button className="btn" onClick={confirmChoice}>
                Continue
              </button>
              <button className="btn btn--secondary" onClick={cancelChoice}>
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Rules Modal */}
      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />
    </>
  )
}
