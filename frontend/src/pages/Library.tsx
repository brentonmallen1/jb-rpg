import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import * as api from '../hooks/api'
import type { StorySummary } from '../types'

// Import theme CSS files
import '../styles/themes/cyberpunk.css'
import '../styles/themes/fantasy.css'
import '../styles/themes/deep_space.css'
import '../styles/themes/modern.css'
import '../styles/themes/horror.css'
import '../styles/themes/insanity.css'

export default function Library() {
  const navigate = useNavigate()
  const { state, toggleColorMode, startSession } = useGame()
  const [stories, setStories] = useState<StorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    loadStories()
  }, [])

  async function loadStories() {
    try {
      const data = await api.getStories()
      setStories(data)
    } catch (err) {
      console.error('Failed to load stories:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateStory() {
    const title = prompt('Enter story title:')
    if (!title) return
    try {
      const story = await api.createStory(title)
      navigate(`/editor/${story.id}`)
    } catch (err) {
      console.error('Failed to create story:', err)
    }
  }

  async function handleDeleteStory(id: string) {
    if (!confirm('Delete this story?')) return
    try {
      await api.deleteStory(id)
      setStories(stories.filter(s => s.id !== id))
    } catch (err) {
      console.error('Failed to delete story:', err)
    }
  }

  async function handleStartSession(storyId: string) {
    try {
      await startSession(storyId)
      navigate('/run')
    } catch (err) {
      console.error('Failed to start session:', err)
    }
  }

  return (
    <>
      <nav className="nav">
        <span className="nav__title">J&B's RPG</span>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
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
        <div className="library-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
          <h1>Story Library</h1>
          <button className="btn" onClick={handleCreateStory}>New Story</button>
        </div>

        {loading ? (
          <div className="empty-state card">
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
              <div
                key={story.id}
                className={`card story-card story-card--${story.theme} ${state?.story_id === story.id ? 'story-card--active' : ''}`}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
              >
                {state?.story_id === story.id && (
                  <span className="session-badge" style={{
                    position: 'absolute',
                    top: 'calc(-1 * var(--space-sm))',
                    right: 'var(--space-md)',
                    background: 'var(--success)',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    textTransform: 'uppercase'
                  }}>Active</span>
                )}
                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{story.title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  <span
                    className={`theme-badge theme-badge--${story.theme}`}
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      textTransform: 'capitalize',
                      marginRight: 'var(--space-sm)'
                    }}
                  >
                    {story.theme.replace('_', ' ')}
                  </span>
                  {story.scene_count} scenes
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'auto' }}>
                  <button className="btn" onClick={() => handleStartSession(story.id)}>
                    Play
                  </button>
                  <button className="btn btn--secondary" onClick={() => navigate(`/editor/${story.id}`)}>
                    Edit
                  </button>
                  <button
                    className="btn btn--secondary"
                    onClick={() => handleDeleteStory(story.id)}
                    style={{ color: 'var(--danger)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div
          className="rules-modal"
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
            className="rules-modal__content"
            style={{
              background: 'var(--bg-secondary)',
              padding: 'var(--space-xl)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ textAlign: 'center', marginBottom: 'var(--space-md)' }}>Game Rules</h2>
            <div style={{ lineHeight: 1.8 }}>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                <strong>Goal</strong><br />
                Reach the final scene and roll 20+ on a d20 to defeat the boss.
              </p>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                <strong>Gameplay</strong><br />
                All players control one shared character. Play through scenes one at a time. Each scene, one player decides which of 3 choices to make.
              </p>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                <strong>Choice Outcomes</strong><br />
                <span style={{ color: 'var(--danger)' }}>Damage</span> — Lose 1 HP (0 HP = defeat)<br />
                <span style={{ color: 'var(--success)' }}>Item</span> — Gain an item (+1 to final roll)<br />
                <span style={{ color: 'var(--warning)' }}>Level Up</span> — Gain a level (+1 roll attempt)
              </p>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                <strong>Starting Stats</strong><br />
                3 HP, Level 1, 0 Items
              </p>
              <p style={{ marginBottom: 'var(--space-md)' }}>
                <strong>Final Boss</strong><br />
                Roll a d20, add your item count as a bonus. Your level = number of roll attempts. Need 20+ total to win.
              </p>
              <p>
                <strong>Character Creation</strong><br />
                Before gameplay, create your character via Mad Libs. Each player fills in a word (name, quirk, occupation, etc.) without knowing how it will be used.
              </p>
            </div>
            <button
              className="btn btn--secondary"
              style={{ marginTop: 'var(--space-lg)', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
              onClick={() => setShowRules(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
