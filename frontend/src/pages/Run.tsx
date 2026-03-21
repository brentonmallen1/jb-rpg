import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import * as api from '../hooks/api'
import type { Story, Choice, Scene, HistoryEntry, ThemeName } from '../types'
import { Modal, ConfirmDialog, RulesModal, HPDisplay, StatsRow, ModeToggle, PageMessage, ContentBox } from '../components'
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
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    return <PageMessage message="Connecting..." />
  }

  // No active session (confirmed after SSE connected)
  if (!state) {
    return (
      <PageMessage
        title="No Active Session"
        message="Start a session from the library to begin playing."
        action={<button className="btn" onClick={() => navigate('/')}>Go to Library</button>}
      />
    )
  }

  // Get current madlib field
  const currentField = story?.madlib_template.fields[state.madlib_step]
  const madlibInputId = 'madlib-input'

  async function handleMadlibSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!madlibInput.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      await submitMadlib(madlibInput.trim())
      setMadlibInput('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleChoice(visualIndex: number, choice: Choice) {
    // Show confirmation modal instead of immediately making choice
    setPendingChoice({ visualIndex, choice })
  }

  async function confirmChoice() {
    if (!pendingChoice || isSubmitting) return
    setIsSubmitting(true)
    try {
      await makeChoice(pendingChoice.visualIndex)
      setPendingChoice(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make choice')
    } finally {
      setIsSubmitting(false)
    }
  }

  function cancelChoice() {
    setPendingChoice(null)
  }

  async function handleFinish(outcome: 'victory' | 'defeat') {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await finish(outcome)
      setError(null)
      setPendingOutcome(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finish game')
    } finally {
      setIsSubmitting(false)
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
          <div className="alert alert--danger mb-md" role="alert">
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
          <ContentBox width="narrow" centered>
            <h1 className="mb-lg">Character Creation</h1>
            <div className="card mb-lg">
              <p className="prose">{story?.madlib_template.prompt}</p>
            </div>
            <div className="text-secondary mb-md">
              Field {state.madlib_step + 1} of {story?.madlib_template.fields.length}
            </div>
            <form onSubmit={handleMadlibSubmit}>
              <label htmlFor={madlibInputId} className="text-xl mb-sm" style={{ display: 'block' }}>
                {currentField.label}
              </label>
              {currentField.hint && (
                <div className="text-secondary text-sm mb-sm italic">({currentField.hint})</div>
              )}
              <div className="text-secondary text-sm mb-sm">
                → fills <code className="code-inline">{'{' + currentField.key + '}'}</code>
              </div>
              <input
                key={state.madlib_step}
                id={madlibInputId}
                type="text"
                value={madlibInput}
                onChange={e => setMadlibInput(e.target.value)}
                className="input w-full mb-md"
                autoFocus
                disabled={isSubmitting}
              />
              <button type="submit" className="btn" disabled={!madlibInput.trim() || isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </form>
          </ContentBox>
        )}

        {/* Character Reveal Phase */}
        {state.status === 'character_reveal' && state.character && (
          <ContentBox width="narrow" centered>
            <h1 className="mb-lg">Read to Players</h1>
            <div className="card mb-lg text-left">
              <div className="font-semibold" style={{ marginBottom: 'var(--space-sm)', fontSize: 'var(--text-xl)' }}>
                {state.character.name}
              </div>
              <p className="prose">{state.character.description}</p>
            </div>
            <button className="btn" onClick={() => proceedFromCharacter()}>
              Continue
            </button>
          </ContentBox>
        )}

        {/* Opening Scene Phase */}
        {state.status === 'opening_scene_active' && resolved && story?.opening_scene && (
          <div className="run-content">
            <h1 className="run-title">{story.opening_scene.title}</h1>
            <div className="card mb-lg">
              <p className="prose">{resolved.scene_text}</p>
            </div>

            {story.opening_scene.choices.length > 0 ? (
              <div className="btn-group--stack">
                {story.opening_scene.choices.map((choice, index) => (
                  <button
                    key={index}
                    className="btn w-full"
                    onClick={() => selectOpeningChoice(index)}
                  >
                    {choice.text}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center">
                <button className="btn" onClick={() => selectOpeningChoice(null)}>
                  Choose Your Path
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scene Selection Phase */}
        {state.status === 'awaiting_scene_selection' && story && (
          <div className="run-content--narrow">
            <h1 className="mb-md">Select Next Scene</h1>

            {/* Player Stats (themed) */}
            <div className={story.theme} style={getThemeVars(story.theme as ThemeName, colorMode)}>
              <div className="run-stats-row">
                <HPDisplay hp={state.hp} />
                <StatsRow level={state.level} itemCount={state.items.length} />
              </div>
            </div>
            <div className="stack gap-md">
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
                    aria-current={scene.id === state.current_scene_id ? 'true' : undefined}
                    aria-disabled={isFinaleDisabled}
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
          <div className="run-content">
            {/* Character info */}
            {state.character && (
              <div className="card mb-lg">
                <div className="font-semibold mb-xs">{state.character.name}</div>
                <div className="text-secondary">{resolved.character_description}</div>
              </div>
            )}

            {/* HP Display & Stats (themed) */}
            <div className={story.theme} style={getThemeVars(story.theme as ThemeName, colorMode)}>
              <div className="mb-lg">
                <HPDisplay hp={state.hp} />
              </div>
              <div className="mb-lg">
                <StatsRow level={state.level} itemCount={state.items.length} />
              </div>
            </div>

            {/* Scene text */}
            <div className="card mb-lg">
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
                  <div className="text-center">
                    {currentScene.finale_setup_text && (
                      <div className="card mb-lg">
                        <p className="prose">{currentScene.finale_setup_text}</p>
                      </div>
                    )}
                    <div className="mb-lg">
                      <p className="text-secondary">Roll a d20 and add {state.items.length} (items)</p>
                      <p className="text-secondary">You have {state.level} roll attempt(s)</p>
                      <p className="text-secondary">Need 20+ total to win!</p>
                    </div>
                    <div className="btn-group">
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
                  <div className="text-center">
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
                  <div className="stack gap-md">
                    {state.shuffled_indices.map((originalIndex: number, visualIndex: number) => {
                      const choice = currentScene?.choices[originalIndex]
                      if (!choice) return null
                      return (
                        <button
                          key={visualIndex}
                          className={`btn choice-btn choice-btn--${choice.kind} text-left`}
                          onClick={() => handleChoice(visualIndex, choice)}
                          style={{ padding: 'var(--space-md)' }}
                        >
                          <div>{choice.display_text}</div>
                          <div className="text-sm mt-xs" style={{ opacity: 0.8 }}>
                            {getOutcomeLabel(choice)}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="text-center mt-md">
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
              <div className="text-center mt-lg">
                <button className="btn btn--secondary" onClick={() => goBack()}>
                  Go Back
                </button>
              </div>
            )}
          </div>
        )}

        {/* Game Over Phase */}
        {state.status === 'game_over' && (
          <div className="run-content--narrow text-center">
            {state.outcome ? (
              <>
                <h1
                  className={`text-5xl mb-lg ${state.outcome === 'victory' ? 'text-success' : 'text-danger'}`}
                  aria-live="assertive"
                >
                  {state.outcome === 'victory' ? 'VICTORY!' : 'DEFEAT'}
                </h1>
                <div className="mb-xl">
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
              (() => {
                const finaleScene = story?.scenes.find(s => s.id === state.current_scene_id)
                return (
                  <>
                    <h1 className="mb-lg">Final Showdown!</h1>
                    {finaleScene?.finale_setup_text && (
                      <div className="card mb-lg">
                        <p className="prose">{finaleScene.finale_setup_text}</p>
                      </div>
                    )}
                    <div className="card mb-lg">
                      <p className="mb-md">Roll a d20 and add {state.items.length} (items)</p>
                      <p className="mb-md">You have {state.level} roll attempt(s)</p>
                      <p>Need 20+ total to win!</p>
                    </div>
                    <div className="btn-group">
                      <button className="btn btn--success" onClick={() => showFinaleOutcome('victory')}>
                        Victory!
                      </button>
                      <button className="btn btn--danger" onClick={() => showFinaleOutcome('defeat')}>
                        Defeat
                      </button>
                    </div>
                  </>
                )
              })()
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
        <div className="mb-lg">
          {pendingOutcome?.text ? (
            <p className="prose">{pendingOutcome.text}</p>
          ) : (
            <p className="text-secondary">No text provided for this outcome.</p>
          )}
        </div>
        <p className="text-secondary text-sm mb-lg">
          Read the text above to your players, then click Continue.
        </p>
        <div className="btn-group">
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
        <p className="text-secondary mb-md">Players can join using this link:</p>
        <input
          type="text"
          readOnly
          value={`${window.location.origin}/player/${state.session_id}`}
          aria-label="Player join link"
          className="input text-center mb-md"
          onClick={e => (e.target as HTMLInputElement).select()}
        />
        <div className="btn-group">
          <button className="btn" onClick={handleCopyLink}>
            {copyFeedback ? 'Copied!' : 'Copy Link'}
          </button>
          <button className="btn btn--secondary" onClick={() => setShowShare(false)}>
            Close
          </button>
        </div>
        {copyFeedback && (
          <p role="status" aria-live="polite" className="text-success text-sm text-center mt-sm">
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
            <div className="card mb-lg">
              <p className="prose">{pendingChoice.choice.result_text}</p>
            </div>
            <div className="btn-group">
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
