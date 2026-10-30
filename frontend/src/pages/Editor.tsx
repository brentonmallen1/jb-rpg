import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../context/useGame'
import * as api from '../hooks/api'
import { useAutoSave } from '../hooks/useAutoSave'
import { useUndoable } from '../hooks/useUndoable'
import { loadAllThemes } from '../hooks/useTheme'
import type { AudioFile, Story, StoryProblem } from '../types'
import { ConfirmDialog, Modal, NowPlaying, PageMessage } from '../components'
import { BackIcon, EyeIcon, MoonIcon, RedoIcon, SunIcon, UndoIcon } from '../components/Icons'
import { addScene, createScene, deleteScene, moveSceneTo } from '../lib/storyEdit'
import { EditorNav, type EditorSelection } from './editor/EditorNav'
import { StoryPanel } from './editor/StoryPanel'
import { CharactersPanel } from './editor/CharactersPanel'
import { OpeningPanel } from './editor/OpeningPanel'
import { ScenePanel } from './editor/ScenePanel'
import { ItemsPanel } from './editor/ItemsPanel'
import { PreviewPane } from './editor/PreviewPane'
import { SuggestionsContext } from './editor/suggest'
import { FlowView } from './editor/FlowView'
import '../styles/stage.css'
import '../styles/phone.css'
import '../styles/pages/library.css'
import '../styles/pages/editor.css'

const SAVE_LABEL = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes' } as const
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

type EditorView = 'text' | 'flow'
const VIEW_KEY = 'jb_rpg_editor_view'

/** Text or Flow, remembered per device */
function readView(): EditorView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'flow' ? 'flow' : 'text'
  } catch {
    return 'text'
  }
}

function readSamples(storyId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(`jb_rpg_samples_${storyId}`) ?? '{}')
  } catch {
    return {}
  }
}

export default function Editor() {
  const { storyId = '' } = useParams<{ storyId: string }>()
  const navigate = useNavigate()
  const { toggleColorMode, colorMode, setTheme, startSession } = useGame()
  const { value: story, update, reset, undo, redo, canUndo, canRedo } = useUndoable<Story>()

  const [loadError, setLoadError] = useState(false)
  const [selection, setSelection] = useState<EditorSelection>({ kind: 'story' })
  const [problems, setProblems] = useState<StoryProblem[]>([])
  const [samples, setSamples] = useState<Record<string, string>>(() => readSamples(storyId))
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [replaceMessage, setReplaceMessage] = useState<string | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [view, setView] = useState<EditorView>(readView)
  // Flow view: the selected node's panel opens beside the canvas
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [audio, setAudio] = useState<AudioFile[]>([])
  const refreshAudio = useCallback(() => {
    api.listAudio(storyId).then(setAudio).catch(() => setAudio([]))
  }, [storyId])
  useEffect(refreshAudio, [refreshAudio])

  // The text field the author was last typing in, for the insert chips
  const textTarget = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // The editor's chrome is the neutral theme; previews and theme swatches need every theme's CSS
  useEffect(() => {
    setTheme('modern')
    loadAllThemes()
  }, [setTheme])

  useEffect(() => {
    let cancelled = false
    api.getStory(storyId)
      .then(data => {
        if (cancelled) return
        reset(data)
        if (data.scenes.length > 0) setSelection({ kind: 'scene', id: data.scenes[0].id })
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [storyId, reset])

  const saveStory = useCallback(async () => {
    if (story) await api.updateStory(story.id, story)
  }, [story])

  const { status: saveStatus, saveNow, statusRef, saveNowRef } = useAutoSave({
    data: story,
    onSave: saveStory,
    debounceMs: 1500,
    enabled: story !== null,
  })

  // What would stop the story being played, re-checked after every save
  useEffect(() => {
    if (!storyId || saveStatus !== 'saved') return
    let cancelled = false
    api.getStoryProblems(storyId)
      .then(r => { if (!cancelled) setProblems(r.problems) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [storyId, saveStatus])

  // Sample answers are a per-device convenience for previews
  function changeSamples(next: Record<string, string>) {
    setSamples(next)
    try {
      localStorage.setItem(`jb_rpg_samples_${storyId}`, JSON.stringify(next))
    } catch {
      // previews just fall back to [key]
    }
  }

  // Warn before closing with unsaved work; save when leaving the page
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current === 'unsaved') e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [statusRef])

  useEffect(() => {
    const status = statusRef
    const save = saveNowRef
    return () => {
      if (status.current === 'unsaved') save.current()
    }
  }, [statusRef, saveNowRef])

  // ⌘S saves, ⌘Z / ⇧⌘Z undo and redo the whole story (works inside text fields too)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(isMac ? e.metaKey : e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        saveNow()
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveNow, undo, redo])

  // A selection can point at one field in its panel (an item's "Given by" / "Checked by"): bring it into view
  useEffect(() => {
    const focus = 'focus' in selection ? selection.focus : undefined
    const field = focus ? document.querySelector<HTMLElement>(`.ed-panel [data-focus="${CSS.escape(focus)}"]`) : null
    if (!field) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    field.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
    ;(field.querySelector<HTMLElement>('textarea') ?? field.querySelector<HTMLElement>('input, select'))?.focus({ preventScroll: true })
    field.classList.add('is-pointed')
    const done = setTimeout(() => field.classList.remove('is-pointed'), 1800)
    return () => clearTimeout(done)
  }, [selection])

  function select(next: EditorSelection) {
    setSelection(next)
    setNavOpen(false)
    setDrawerOpen(true)
  }

  function changeView(next: EditorView) {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // per-device convenience only
    }
  }

  function rememberTextField(e: React.FocusEvent) {
    const el = e.target
    if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text')) {
      textTarget.current = el
    }
  }

  async function playtest(force = false) {
    setError(null)
    setReplaceMessage(null)
    try {
      await saveNow()
      await startSession(storyId, force)
      navigate('/run')
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 409) {
        setReplaceMessage(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Could not start a playtest.')
        if (err instanceof api.ApiError && err.status === 422) select({ kind: 'story' })
      }
    }
  }

  if (loadError) {
    return (
      <PageMessage
        title="Story not found"
        message="It may have been deleted."
        action={<button className="btn" onClick={() => navigate('/')}>Back to the library</button>}
      />
    )
  }
  if (!story) return <PageMessage message="Loading…" />

  const selectedScene = selection.kind === 'scene' ? story.scenes.find(s => s.id === selection.id) : undefined
  const errors = problems.filter(p => p.severity === 'error')
  const suggestions = story.madlib_template.fields.filter(f => f.key.trim()).map(f => ({ token: `{${f.key}}`, hint: f.label }))

  function renderPanel() {
    if (!story) return null
    if (selection.kind === 'characters') {
      return <CharactersPanel story={story} problems={problems} samples={samples} onSamples={changeSamples} update={update} />
    }
    if (selection.kind === 'items') {
      return <ItemsPanel story={story} itemId={selection.id} problems={problems} update={update} onSelect={select} dragToCanvas={view === 'flow'} />
    }
    if (selection.kind === 'opening' && story.opening_scene) {
      return <OpeningPanel story={story} opening={story.opening_scene} problems={problems} update={update} textTarget={textTarget} />
    }
    if (selectedScene) {
      return (
        <ScenePanel
          key={selectedScene.id}
          story={story}
          scene={selectedScene}
          problems={problems}
          update={update}
          textTarget={textTarget}
          audio={audio}
          onDelete={() => setDeleteTarget(selectedScene.id)}
          onOpenItem={id => select({ kind: 'items', id })}
        />
      )
    }
    return <StoryPanel story={story} problems={problems} update={update} onJump={select} audio={audio} onAudioChange={refreshAudio} />
  }

  return (
    <div className="stage editor">
      <header className="stage__bar">
        <div className="editor__title">
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back to the library" title="Back to the library">
            <BackIcon />
          </button>
          <button className="icon-btn editor__nav-toggle" onClick={() => setNavOpen(!navOpen)} aria-expanded={navOpen} aria-label="Story sections">☰</button>
          <span className="stage__story-title">{story.title || 'Untitled story'}</span>
          <span className={`editor__save editor__save--${saveStatus}`} role="status">{SAVE_LABEL[saveStatus]}</span>
          <div className="ed-segmented ed-segmented--small editor__view" role="radiogroup" aria-label="Edit as">
            <button type="button" role="radio" aria-checked={view === 'text'} onClick={() => changeView('text')}>Text</button>
            <button type="button" role="radio" aria-checked={view === 'flow'} onClick={() => changeView('flow')}>Flow</button>
          </div>
        </div>
        <div className="stage__tools">
          <NowPlaying />
          <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo" title={`Undo (${isMac ? '⌘' : 'Ctrl+'}Z)`}><UndoIcon /></button>
          <button className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="Redo" title={`Redo (${isMac ? '⇧⌘' : 'Ctrl+'}${isMac ? 'Z' : 'Y'})`}><RedoIcon /></button>
          <button className="icon-btn editor__preview-toggle" onClick={() => setPreviewOpen(!previewOpen)} aria-pressed={previewOpen} aria-label="Preview">
            <EyeIcon />
          </button>
          <button className="icon-btn" onClick={toggleColorMode} aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}>
            {colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          {errors.length > 0 && (
            <button className="s-btn s-btn--ghost editor__problems" onClick={() => select({ kind: 'story' })}>
              {errors.length} to fix
            </button>
          )}
          <button className="s-btn" onClick={() => playtest()}>Playtest</button>
        </div>
      </header>

      {view === 'flow' ? (
        <div className={`editor__layout editor__layout--flow ${drawerOpen ? 'has-drawer' : ''}`}>
          <FlowView story={story} problems={problems} selection={selection} update={update} onSelect={select} />
          {drawerOpen && (
            <aside className="editor__drawer" aria-label="Edit the selection" onFocusCapture={rememberTextField}>
              <div className="editor__drawer-bar">
                <div className="ed-segmented ed-segmented--small" role="group" aria-label="Story sections">
                  <button type="button" aria-pressed={selection.kind === 'story'} onClick={() => select({ kind: 'story' })}>Story</button>
                  <button type="button" aria-pressed={selection.kind === 'characters'} onClick={() => select({ kind: 'characters' })}>Characters</button>
                  <button type="button" aria-pressed={selection.kind === 'items'} onClick={() => select({ kind: 'items' })}>Items</button>
                </div>
                <button type="button" className="s-btn s-btn--ghost" onClick={() => setDrawerOpen(false)}>Close</button>
              </div>
              {error && (
                <div className="stage-error" role="alert">
                  <span>{error}</span>
                  <button className="s-btn s-btn--ghost" onClick={() => setError(null)}>Dismiss</button>
                </div>
              )}
              <SuggestionsContext.Provider value={suggestions}>
                {renderPanel()}
              </SuggestionsContext.Provider>
            </aside>
          )}
          {!drawerOpen && (
            <button type="button" className="s-btn s-btn--ghost editor__drawer-open" onClick={() => setDrawerOpen(true)}>
              Story, characters and items
            </button>
          )}
        </div>
      ) : (
        <div className="editor__layout">
          <div className={`editor__nav ${navOpen ? 'is-open' : ''}`}>
            <EditorNav
              story={story}
              selection={selection}
              problems={problems}
              onSelect={select}
              onAddScene={() => {
                const scene = createScene(story)
                update(s => addScene(s, scene))
                select({ kind: 'scene', id: scene.id })
              }}
              onAddOpening={() => {
                update(s => ({ ...s, opening_scene: { title: 'Prologue', base_text: '', choices: [], conditional_text: [] } }))
                select({ kind: 'opening' })
              }}
              onMoveScene={(id, to) => update(s => moveSceneTo(s, id, to))}
            />
          </div>

          <main className="editor__main" onFocusCapture={rememberTextField}>
            {error && (
              <div className="stage-error" role="alert">
                <span>{error}</span>
                <button className="s-btn s-btn--ghost" onClick={() => setError(null)}>Dismiss</button>
              </div>
            )}
            {/* Typing "{" in any text offers the hero's answers */}
            <SuggestionsContext.Provider value={suggestions}>
              {renderPanel()}
            </SuggestionsContext.Provider>
          </main>

          <div className={`editor__preview ${previewOpen ? 'is-open' : ''}`}>
            <PreviewPane story={story} selection={selection} samples={samples} colorMode={colorMode} />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onConfirm={() => {
          const id = deleteTarget
          setDeleteTarget(null)
          if (!id) return
          const remaining = story.scenes.filter(s => s.id !== id)
          update(s => deleteScene(s, id))
          select(remaining[0] ? { kind: 'scene', id: remaining[0].id } : { kind: 'story' })
        }}
        onCancel={() => setDeleteTarget(null)}
        title="Delete this scene?"
        message={`“${story.scenes.find(s => s.id === deleteTarget)?.title}” will be removed, and anything that led to it will go where the story goes by default. You can undo this with ${isMac ? '⌘' : 'Ctrl+'}Z.`}
        confirmText="Delete"
        variant="danger"
      />

      <Modal isOpen={replaceMessage !== null} onClose={() => setReplaceMessage(null)} title="A game is already running">
        <p className="mb-lg">{replaceMessage} Playtesting will end it and disconnect its players.</p>
        <div className="btn-group">
          <button className="btn btn--secondary" onClick={() => setReplaceMessage(null)}>Cancel</button>
          <button className="btn btn--danger" onClick={() => playtest(true)}>End it and playtest</button>
        </div>
      </Modal>
    </div>
  )
}
