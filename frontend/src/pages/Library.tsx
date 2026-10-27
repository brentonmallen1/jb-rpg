import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/useGame'
import * as api from '../hooks/api'
import { loadAllThemes } from '../hooks/useTheme'
import type { StorySummary } from '../types'
import { Modal, RulesModal, ConfirmDialog, InputDialog } from '../components'
import { BookIcon, MoonIcon, SunIcon } from '../components/Icons'
import '../styles/stage.css'
import '../styles/pages/library.css'

const THEME_LABEL: Record<string, string> = {
  cyberpunk: 'Cyberpunk', fantasy: 'Fantasy', deep_space: 'Deep Space', modern: 'Modern', horror: 'Horror', insanity: 'Insanity',
}

export default function Library() {
  const navigate = useNavigate()
  const {
    state, toggleColorMode, colorMode, startSession, resumeSession, endSession, isStoryteller,
    sessionElsewhere, setCurrentStory, isInitializing, isValidatingToken,
  } = useGame()
  const [stories, setStories] = useState<StorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StorySummary | null>(null)
  const [stopTarget, setStopTarget] = useState(false)
  const [replaceTarget, setReplaceTarget] = useState<{ story: StorySummary; message: string } | null>(null)
  const [showTakeOver, setShowTakeOver] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)

  // The library chrome uses the neutral theme; each cover wears its own story's theme
  useEffect(() => {
    setCurrentStory(null)
    loadAllThemes()
  }, [setCurrentStory])

  useEffect(() => {
    loadStories()
  }, [])

  async function loadStories() {
    setError(null)
    try {
      setStories(await api.getStories())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stories.')
    } finally {
      setLoading(false)
    }
  }

  async function attempt(action: () => Promise<unknown>, fallback: string) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    }
  }

  async function handleCreateStory(title: string) {
    setShowCreateDialog(false)
    await attempt(async () => navigate(`/editor/${(await api.createStory(title)).id}`), 'Failed to create story.')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow importing the same file again
    if (!file) return
    await attempt(async () => {
      let data: unknown
      try {
        data = JSON.parse(await file.text())
      } catch {
        throw new Error(`“${file.name}” isn't a story file (it isn't valid JSON).`)
      }
      const story = await api.importStory(data)
      setStories(s => [...s, { id: story.id, title: story.title, theme: story.theme, scene_count: story.scenes.length }])
    }, 'Failed to import story.')
  }

  async function handleDeleteStory() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeleteTarget(null)
    await attempt(async () => {
      await api.deleteStory(id)
      setStories(s => s.filter(story => story.id !== id))
    }, 'Failed to delete story.')
  }

  async function handleStartSession(story: StorySummary, force = false) {
    setError(null)
    setReplaceTarget(null)
    try {
      await startSession(story.id, force)
      navigate('/run')
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 409) {
        // Another session is running: ask before ending it
        setReplaceTarget({ story, message: err.message })
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to start session.')
    }
  }

  async function handleTakeOver() {
    setShowTakeOver(false)
    await attempt(async () => {
      await resumeSession()
      navigate('/run')
    }, 'Failed to take over the session.')
  }

  const activeStory = state ? stories.find(s => s.id === state.story_id) : undefined
  const sessionLoading = isInitializing || isValidatingToken

  return (
    <div className="stage library">
      <a href="#main-content" className="visually-hidden">Skip to content</a>

      <header className="stage__bar">
        <span className="library__wordmark">J&amp;B’s RPG</span>
        <div className="stage__tools">
          <button className="icon-btn" onClick={() => setShowRules(true)} aria-label="Rules" title="Rules">
            <BookIcon />
          </button>
          <button className="icon-btn" onClick={toggleColorMode} aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}>
            {colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main id="main-content" className="library__main">
        <div className="library__header">
          <div>
            <div className="eyebrow">Choose tonight’s adventure</div>
            <h1 className="stage-title" style={{ margin: '4px 0 0' }}>Your stories</h1>
          </div>
          <div className="action-row" style={{ marginTop: 0 }}>
            <button className="s-btn s-btn--ghost" onClick={() => importInput.current?.click()}>Import</button>
            <button className="s-btn" onClick={() => setShowCreateDialog(true)}>New story</button>
            <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={handleImport} aria-label="Import a story file" />
          </div>
        </div>

        {state && isStoryteller && !sessionLoading && (
          <div className="now-playing" role="status">
            <div>
              <span className="stage-label">Now playing</span>
              <div className="now-playing__title">{activeStory?.title ?? 'A session is running'}</div>
            </div>
            <div className="action-row" style={{ marginTop: 0 }}>
              <button className="s-btn" onClick={() => navigate('/run')}>Return to the table</button>
              <button className="s-btn s-btn--ghost" onClick={() => setStopTarget(true)}>End session</button>
            </div>
          </div>
        )}

        {sessionElsewhere && (
          <div className="now-playing" role="status">
            <div>
              <span className="stage-label">Running elsewhere</span>
              <div className="now-playing__title">A session is being run from another tab or device.</div>
            </div>
            <button className="s-btn" onClick={() => setShowTakeOver(true)}>Take over</button>
          </div>
        )}

        {error && (
          <div className="stage-error" role="alert">
            <span>{error}</span>
            <button className="s-btn s-btn--ghost" onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        {loading ? (
          <p className="library__empty" aria-busy="true">Loading stories…</p>
        ) : stories.length === 0 ? (
          <div className="library__empty">
            <h2 className="library__empty-title">No stories yet</h2>
            <p>
              A story is a handful of scenes, each ending in three choices: one costs a life, one finds an item,
              one levels the hero up. Players build the hero together with a round of mad-lib questions, then
              everything comes down to a single d20 roll.
            </p>
            <div className="action-row">
              <button className="s-btn" onClick={() => setShowCreateDialog(true)}>Write your first story</button>
              {error && <button className="s-btn s-btn--ghost" onClick={loadStories}>Try again</button>}
            </div>
          </div>
        ) : (
          <ul className="covers">
            {stories.map((story, i) => {
              const isActive = state?.story_id === story.id
              return (
                <li key={story.id} className={`cover ${story.theme}`} style={{ '--i': i } as React.CSSProperties}>
                  <div className="cover__art" aria-hidden="true" />
                  <div className="cover__body">
                    <span className="cover__theme">{THEME_LABEL[story.theme] ?? story.theme}{isActive && ' · now playing'}</span>
                    <h2 className="cover__title">{story.title}</h2>
                    <span className="cover__meta">{story.scene_count} {story.scene_count === 1 ? 'scene' : 'scenes'}</span>
                  </div>
                  <div className="cover__actions">
                    {isActive && isStoryteller ? (
                      <button className="s-btn" onClick={() => navigate('/run')}>Resume</button>
                    ) : (
                      <button className="s-btn" onClick={() => handleStartSession(story)} disabled={sessionLoading}>Play</button>
                    )}
                    <button className="s-btn s-btn--ghost" onClick={() => navigate(`/editor/${story.id}`)}>Edit</button>
                    <details className="menu">
                      <summary className="icon-btn" aria-label={`More actions for ${story.title}`}>⋯</summary>
                      <div className="menu__panel">
                        <button onClick={() => attempt(async () => api.downloadStoryAsJson(await api.getStory(story.id)), 'Failed to export story.')}>
                          Export as JSON
                        </button>
                        <button onClick={() => attempt(async () => {
                          const copy = await api.duplicateStory(story.id)
                          setStories(s => [...s, { id: copy.id, title: copy.title, theme: copy.theme, scene_count: copy.scenes.length }])
                        }, 'Failed to duplicate story.')}>
                          Duplicate
                        </button>
                        <button className="menu__danger" onClick={() => setDeleteTarget(story)}>Delete story…</button>
                      </div>
                    </details>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      <RulesModal isOpen={showRules} onClose={() => setShowRules(false)} />

      <InputDialog
        isOpen={showCreateDialog}
        onSubmit={handleCreateStory}
        onCancel={() => setShowCreateDialog(false)}
        title="New story"
        label="What's it called?"
        placeholder="The Circle Room"
        submitText="Create"
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onConfirm={handleDeleteStory}
        onCancel={() => setDeleteTarget(null)}
        title="Delete this story?"
        message={`“${deleteTarget?.title}” will be gone for good. Export it first if you might want it back.`}
        confirmText="Delete"
        variant="danger"
      />

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

      <ConfirmDialog
        isOpen={showTakeOver}
        onConfirm={handleTakeOver}
        onCancel={() => setShowTakeOver(false)}
        title="Take over this session?"
        message="You'll become the storyteller here. The game continues where it is, and the other tab loses control."
        confirmText="Take over"
        variant="default"
      />

      <ConfirmDialog
        isOpen={stopTarget}
        onConfirm={() => { setStopTarget(false); attempt(endSession, 'Failed to end the session.') }}
        onCancel={() => setStopTarget(false)}
        title="End the session?"
        message="This disconnects all players and ends the current game."
        confirmText="End session"
        variant="danger"
      />
    </div>
  )
}
