import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import * as api from '../hooks/api'
import type { StorySummary, ThemeName } from '../types'
import { RulesModal, ConfirmDialog, InputDialog, ModeToggle } from '../components'
import { getThemeVars } from '../styles/themeVars'
import '../styles/pages/library.css'

export default function Library() {
  const navigate = useNavigate()
  const { state, toggleColorMode, colorMode, startSession, stopSession, isStoryteller, setCurrentStory, isInitializing, isValidatingToken } = useGame()
  const [stories, setStories] = useState<StorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StorySummary | null>(null)
  const [stopTarget, setStopTarget] = useState<StorySummary | null>(null)
  const [stopping, setStopping] = useState(false)

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

  async function handleStartSession(storyId: string) {
    setError(null)
    try {
      await startSession(storyId)
      navigate('/run')
    } catch (err) {
      console.error('Failed to start session:', err)
      setError('Failed to start session. Please try again.')
    }
  }

  async function handleStopSession() {
    if (!stopTarget) return
    setStopTarget(null)
    setStopping(true)
    setError(null)
    try {
      await stopSession()
    } catch (err) {
      console.error('Failed to stop session:', err)
      setError(err instanceof Error ? err.message : 'Failed to stop session. Please try again.')
    } finally {
      setStopping(false)
    }
  }

  return (
    <>
      {/* Skip link for keyboard navigation */}
      <a href="#main-content" className="visually-hidden" style={{ position: 'absolute', top: 0, left: 0, padding: 'var(--space-sm)', background: 'var(--accent)', color: 'var(--text-on-accent)', zIndex: 9999 }}>
        Skip to content
      </a>

      <nav className="nav">
        <span className="nav__title">J&B's RPG</span>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <button
            className="btn btn--secondary"
            onClick={() => setShowRules(true)}
            style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: 'var(--text-sm)' }}
          >
            Rules
          </button>
          <ModeToggle colorMode={colorMode} onToggle={toggleColorMode} />
        </div>
      </nav>

      <main id="main-content" className="container">
        <div className="library-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
          <h1>Story Library</h1>
          <button className="btn" onClick={() => setShowCreateDialog(true)}>New Story</button>
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            style={{
              background: 'var(--danger)',
              color: 'var(--text-on-danger)',
              padding: 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-lg)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>{error}</span>
            <button
              className="btn btn--secondary"
              onClick={() => setError(null)}
              style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: 'var(--text-sm)' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="empty-state card" aria-live="polite" aria-busy="true">
            <p>Loading stories...</p>
          </div>
        ) : stories.length === 0 ? (
          <div className="empty-state card">
            <p>No stories yet. Create your first adventure!</p>
          </div>
        ) : (
          <div className="story-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 'var(--space-lg)',
            marginTop: 'var(--space-lg)'
          }}>
            {stories.map(story => (
              <article
                key={story.id}
                className={`card story-card story-card--${story.theme} ${state?.story_id === story.id ? 'story-card--active' : ''}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-md)',
                  position: 'relative',
                  ...getThemeVars(story.theme as ThemeName, colorMode),
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
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
                <h2 className="font-semibold" style={{ fontSize: 'var(--text-xl)', margin: 0, color: 'var(--text-primary)' }}>{story.title}</h2>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  <span
                    className="text-xs"
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      textTransform: 'capitalize',
                      marginRight: 'var(--space-sm)',
                      background: 'var(--accent)',
                      color: 'var(--bg-primary)',
                    }}
                  >
                    {story.theme.replace('_', ' ')}
                  </span>
                  {story.scene_count} scenes
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'auto', flexWrap: 'wrap' }}>
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
                      // Someone else is running the session
                      <span className="text-secondary" style={{ padding: 'var(--space-xs) 0' }}>
                        Session in progress
                      </span>
                    )
                  ) : (
                    // No active session for this story
                    <button className="btn" onClick={() => handleStartSession(story.id)}>
                      Play
                    </button>
                  )}
                  <button className="btn btn--secondary" onClick={() => navigate(`/editor/${story.id}`)}>
                    Edit
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
