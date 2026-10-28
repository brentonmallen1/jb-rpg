import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../context/useGame'
import * as api from '../hooks/api'
import { loadAllThemes } from '../hooks/useTheme'
import type { GameOptions, StorySummary, TurnMode } from '../types'
import { Modal, RulesModal, ConfirmDialog, InputDialog } from '../components'
import { BookIcon, MoonIcon, SunIcon } from '../components/Icons'
import '../styles/stage.css'
import '../styles/pages/library.css'

const TURN_MODES: { mode: TurnMode; title: string; description: string }[] = [
  { mode: 'storyteller', title: 'The storyteller decides', description: 'The table talks it over and you make each choice. Nobody needs to join by name.' },
  { mode: 'rotate', title: 'Players take turns', description: 'Players join with their name; each scene, the next person in line has the final say.' },
  { mode: 'pick', title: 'You pick who decides', description: 'Players join with their name; each scene, you choose whose call it is.' },
  { mode: 'vote', title: 'The table votes', description: 'Everyone votes on their phone against the clock. You see the table’s preference and make the call.' },
]

// The table's "no flashing" choice is remembered on this device for the next game
const NO_FLASHING_KEY = 'jb_rpg_no_flashing'

function readNoFlashing(): boolean {
  try {
    return localStorage.getItem(NO_FLASHING_KEY) === 'on'
  } catch {
    return false
  }
}

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
  const [replaceTarget, setReplaceTarget] = useState<{ story: StorySummary; message: string; options: GameOptions } | null>(null)
  const [playTarget, setPlayTarget] = useState<StorySummary | null>(null)
  const [turnMode, setTurnMode] = useState<TurnMode>('storyteller')
  const [noFlashing, setNoFlashing] = useState(readNoFlashing)
  const [showTakeOver, setShowTakeOver] = useState(false)
  const [canSignOut, setCanSignOut] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)

  // The library chrome uses the neutral theme; each cover wears its own story's theme
  useEffect(() => {
    setCurrentStory(null)
    loadAllThemes()
  }, [setCurrentStory])

  useEffect(() => {
    loadStories()
    api.adminSession().then(s => setCanSignOut(s.required && s.signed_in)).catch(() => {})
  }, [])

  async function signOut() {
    await api.logout().catch(() => {})
    navigate('/login', { replace: true })
  }

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

  async function handleStartSession(story: StorySummary, options: GameOptions, force = false) {
    setError(null)
    setReplaceTarget(null)
    setPlayTarget(null)
    try {
      localStorage.setItem(NO_FLASHING_KEY, options.noFlashing ? 'on' : 'off')
    } catch {
      // a per-device convenience only
    }
    try {
      await startSession(story.id, force, options)
      navigate('/run')
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 409) {
        // Another session is running: ask before ending it
        setReplaceTarget({ story, message: err.message, options })
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
        <span className="library__wordmark"><img src="/favicon.svg" alt="" width="26" height="26" />J&amp;B’s RPG</span>
        <div className="stage__tools">
          <button className="icon-btn" onClick={() => setShowRules(true)} aria-label="Rules" title="Rules">
            <BookIcon />
          </button>
          <button className="icon-btn" onClick={toggleColorMode} aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}>
            {colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          {canSignOut && <button className="s-btn s-btn--ghost" onClick={signOut}>Sign out</button>}
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
                      <button className="s-btn" onClick={() => { setTurnMode('storyteller'); setPlayTarget(story) }} disabled={sessionLoading}>Play</button>
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

      <Modal isOpen={playTarget !== null} onClose={() => setPlayTarget(null)} title={`Play “${playTarget?.title}”`}>
        <fieldset className="turn-modes">
          <legend>Who makes the choices?</legend>
          {TURN_MODES.map(m => (
            <label key={m.mode} className={`turn-mode ${turnMode === m.mode ? 'is-selected' : ''}`}>
              <input type="radio" name="turn-mode" value={m.mode} checked={turnMode === m.mode} onChange={() => setTurnMode(m.mode)} />
              <span>
                <strong>{m.title}</strong>
                <span className="turn-mode__desc">{m.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="calm-option">
          <input type="checkbox" checked={noFlashing} onChange={e => setNoFlashing(e.target.checked)} />
          <span>
            <strong>No flashing effects</strong>
            <span className="turn-mode__desc">Every screen keeps to gentle fades: no flashes, flicker or shaking. You can change this during the game.</span>
          </span>
        </label>
        <div className="btn-group">
          <button className="btn btn--secondary" onClick={() => setPlayTarget(null)}>Cancel</button>
          <button className="btn" onClick={() => playTarget && handleStartSession(playTarget, { turnMode, noFlashing })} autoFocus>Start the game</button>
        </div>
      </Modal>

      <Modal isOpen={replaceTarget !== null} onClose={() => setReplaceTarget(null)} title="A session is already running">
        <p className="mb-lg">{replaceTarget?.message} You can take over that game, or end it and start “{replaceTarget?.story.title}”.</p>
        <div className="btn-group">
          <button className="btn btn--secondary" onClick={() => setReplaceTarget(null)}>Cancel</button>
          <button className="btn btn--secondary" onClick={() => { setReplaceTarget(null); handleTakeOver() }}>Take over</button>
          <button className="btn btn--danger" onClick={() => replaceTarget && handleStartSession(replaceTarget.story, replaceTarget.options, true)}>
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
