import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/useGame'
import * as api from '../hooks/api'
import type { StorySummary, ThemeName } from '../types'
import { Modal, RulesModal, ConfirmDialog, InputDialog, ModeToggle } from '../components'
import { getThemeVars } from '../styles/themeVars'
import '../styles/pages/library.css'

export default function Library() {
  const navigate = useNavigate()
  const { state, toggleColorMode, colorMode, startSession, resumeSession, endSession, isStoryteller, sessionElsewhere, setCurrentStory, isInitializing, isValidatingToken } = useGame()
  const [stories, setStories] = useState<StorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StorySummary | null>(null)
  const [stopTarget, setStopTarget] = useState<StorySummary | null>(null)
  const [stopping, setStopping] = useState(false)
  const [replaceTarget, setReplaceTarget] = useState<{ story: StorySummary; message: string } | null>(null)
  const [showTakeOver, setShowTakeOver] = useState(false)

  // Clear currentStory so the page uses the default 'modern' theme
  useEffect(() => {
    setCurrentStory(null)
  }, [setCurrentStory])

  useEffect(() => {
    loadStories()
  }, [])

  async function loadStories() {
    setError(null)
    try {
      const data = await api.getStories()
      setStories(data)
    } catch (err) {
      console.error('Failed to load stories:', err)
      setError('Failed to load stories. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateStory(title: string) {
    setShowCreateDialog(false)
    try {
      const story = await api.createStory(title)
      navigate(`/editor/${story.id}`)
    } catch (err) {
      console.error('Failed to create story:', err)
      setError('Failed to create story. Please try again.')
    }
  }

  async function handleDeleteStory() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeleteTarget(null)
    try {
      await api.deleteStory(id)
      setStories(stories.filter(s => s.id !== id))
    } catch (err) {
      console.error('Failed to delete story:', err)
      setError('Failed to delete story. Please try again.')
    }
  }

  async function handleStartSession(story: StorySummary, force = false) {
    setError(null)
    setReplaceTarget(null)
    try {
      await startSession(story.id, force)
      navigate('/run')
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 409) {
        // Another session is running: confirm before ending it
        setReplaceTarget({ story, message: err.message })
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to start session. Please try again.')
    }
  }

  async function handleTakeOver() {
    setShowTakeOver(false)
    setError(null)
    try {
      await resumeSession()
      navigate('/run')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to take over the session.')
    }
  }

  async function handleStopSession() {
    if (!stopTarget) return
    setStopTarget(null)
    setStopping(true)
    setError(null)
    try {
      await endSession()
    } catch (err) {
      console.error('Failed to stop session:', err)
      setError(err instanceof Error ? err.message : 'Failed to stop session. Please try again.')
    } finally {
      setStopping(false)
    }
  }

  async function handleExport(storyId: string) {
    try {
      const story = await api.getStory(storyId)
      api.downloadStoryAsJson(story)
    } catch (err) {
      console.error('Failed to export story:', err)
      setError('Failed to export story. Please try again.')
    }
  }

  return (
    <>
      {/* Skip link for keyboard navigation */}
      <a href="#main-content" className="visually-hidden">
        Skip to content
      </a>

      <nav className="nav">
        <span className="nav__title">J&B's RPG</span>
        <div className="row gap-sm">
          <button className="btn btn--secondary text-sm" onClick={() => setShowRules(true)}>
            Rules
          </button>
          <ModeToggle colorMode={colorMode} onToggle={toggleColorMode} />
        </div>
      </nav>

      <main id="main-content" className="container">
        <div className="library-header row-between mb-sm">
          <h1>Story Library</h1>
          <button className="btn" onClick={() => setShowCreateDialog(true)}>New Story</button>
        </div>

        {sessionElsewhere && (
          <div className="alert alert--warning mb-lg" role="status">
            <span>A session is running from another tab or device.</span>
            <button className="btn text-sm" onClick={() => setShowTakeOver(true)}>Take over</button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="alert alert--danger mb-lg" role="alert">
            <span>{error}</span>
            <button className="btn btn--secondary text-sm" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="empty-state card" aria-live="polite" aria-busy="true">
            <div className="page-loader mb-md" aria-hidden="true"><span /></div>
            <p>Loading stories...</p>
          </div>
        ) : error && stories.length === 0 ? (
          <div className="empty-state card">
            <p className="text-danger mb-md">Failed to load stories</p>
            <button className="btn" onClick={loadStories}>Try Again</button>
          </div>
        ) : stories.length === 0 ? (
          <div className="empty-state card">
            <p>No stories yet. Create your first adventure!</p>
          </div>
        ) : (
          <div className="story-grid mt-lg">
            {stories.map(story => (
              <article
                key={story.id}
                className={`card story-card story-card--${story.theme} ${state?.story_id === story.id ? 'story-card--active' : ''}`}
                style={getThemeVars(story.theme as ThemeName, colorMode)}
              >
                {state?.story_id === story.id && (
                  <span
                    className="session-badge font-semibold uppercase"
                    aria-label="Active session"
                    style={{
                      position: 'absolute',
                      top: 'calc(-1 * var(--space-sm))',
                      right: 'var(--space-md)',
                      background: 'var(--success)',
                      color: 'var(--text-on-success)',
                      fontSize: 'var(--text-xs)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    Active
                  </span>
                )}
                <h2 className="font-semibold text-xl truncate" title={story.title}>{story.title}</h2>
                <div className="story-card-meta">
                  <span className="theme-badge">{story.theme.replace('_', ' ')}</span>
                  {story.scene_count} scenes
                </div>
                <div className="story-card-actions">
                  {state?.story_id === story.id ? (
                    // This story has an active session
                    isInitializing || isValidatingToken ? (
                      // Still loading - don't show session controls yet
                      <span className="text-secondary" style={{ padding: 'var(--space-xs) 0' }}>
                        Loading...
                      </span>
                    ) : isStoryteller ? (
                      // User is the storyteller - show Resume/Stop
                      <>
                        <button className="btn" onClick={() => navigate('/run')}>
                          Resume
                        </button>
                        <button
                          className="btn btn--secondary text-danger"
                          onClick={() => setStopTarget(story)}
                          disabled={stopping}
                        >
                          {stopping ? 'Stopping...' : 'Stop'}
                        </button>
                      </>
                    ) : (
                      // Running in another tab or device
                      <button className="btn" onClick={() => setShowTakeOver(true)}>
                        Take over
                      </button>
                    )
                  ) : (
                    // No active session for this story
                    <button className="btn" onClick={() => handleStartSession(story)}>
                      Play
                    </button>
                  )}
                  <button className="btn btn--secondary" onClick={() => navigate(`/editor/${story.id}`)}>
                    Edit
                  </button>
                  <button
                    className="btn btn--secondary"
                    onClick={() => handleExport(story.id)}
                    aria-label={`Export ${story.title}`}
                  >
                    Export
                  </button>
                  <button
                    className="btn btn--secondary text-danger"
                    onClick={() => setDeleteTarget(story)}
                    aria-label={`Delete ${story.title}`}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Rules Modal */}
      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />

      {/* Create Story Dialog */}
      <InputDialog
        isOpen={showCreateDialog}
        onSubmit={handleCreateStory}
        onCancel={() => setShowCreateDialog(false)}
        title="Create New Story"
        label="Enter a title for your story:"
        placeholder="My Epic Adventure"
        submitText="Create"
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onConfirm={handleDeleteStory}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Story?"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Starting while another session runs */}
      <Modal isOpen={replaceTarget !== null} onClose={() => setReplaceTarget(null)} title="A session is already running">
        <p className="mb-lg">{replaceTarget?.message} You can take over that game, or end it and start “{replaceTarget?.story.title}”.</p>
        <div className="btn-group">
          <button className="btn btn--secondary" onClick={() => setReplaceTarget(null)}>Cancel</button>
          <button className="btn btn--secondary" onClick={() => { setReplaceTarget(null); handleTakeOver() }}>Take over</button>
          <button className="btn btn--danger" onClick={() => replaceTarget && handleStartSession(replaceTarget.story, true)}>
            End it and start
          </button>
        </div>
      </Modal>

      {/* Taking over a session run from another tab */}
      <ConfirmDialog
        isOpen={showTakeOver}
        onConfirm={handleTakeOver}
        onCancel={() => setShowTakeOver(false)}
        title="Take over this session?"
        message="You'll become the storyteller here. The game continues where it is, and the other tab loses control."
        confirmText="Take over"
        variant="default"
      />

      {/* Stop Session Confirmation Dialog */}
      <ConfirmDialog
        isOpen={stopTarget !== null}
        onConfirm={handleStopSession}
        onCancel={() => setStopTarget(null)}
        title="End Session?"
        message="This will disconnect all players and end the current session."
        confirmText="End Session"
        variant="danger"
      />
    </>
  )
}
