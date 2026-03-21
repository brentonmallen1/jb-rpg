import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import * as api from '../hooks/api'
import type { Story, Scene, Choice, ThemeName, ChoiceKind, OpeningScene, OpeningChoice } from '../types'
import { ConfirmDialog, ModeToggle } from '../components'
import '../styles/pages/editor.css'

const THEMES: ThemeName[] = ['cyberpunk', 'fantasy', 'deep_space', 'modern', 'horror', 'insanity']

export default function Editor() {
  const { storyId } = useParams<{ storyId: string }>()
  const navigate = useNavigate()
  const { toggleColorMode, colorMode, setTheme } = useGame()

  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [editingOpeningScene, setEditingOpeningScene] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [deleteSceneTarget, setDeleteSceneTarget] = useState<string | null>(null)

  useEffect(() => {
    if (storyId) {
      loadStory(storyId)
    }
  }, [storyId])

  // Close sidebar when a scene is selected (mobile)
  useEffect(() => {
    if (selectedSceneId || editingOpeningScene) {
      setSidebarOpen(false)
    }
  }, [selectedSceneId, editingOpeningScene])

  async function loadStory(id: string) {
    try {
      const data = await api.getStory(id)
      setStory(data)
      setTheme(data.theme)
      if (data.scenes.length > 0) {
        setSelectedSceneId(data.scenes[0].id)
      }
    } catch (err) {
      console.error('Failed to load story:', err)
    } finally {
      setLoading(false)
    }
  }

  async function saveStory() {
    if (!story) return
    setSaving(true)
    try {
      await api.updateStory(story.id, story)
    } catch (err) {
      console.error('Failed to save story:', err)
    } finally {
      setSaving(false)
    }
  }

  function updateStory(updates: Partial<Story>) {
    if (!story) return
    setStory({ ...story, ...updates })
  }

  function updateScene(sceneId: string, updates: Partial<Scene>) {
    if (!story) return
    setStory({
      ...story,
      scenes: story.scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s)
    })
  }

  function addScene() {
    if (!story) return
    const newScene: Scene = {
      id: crypto.randomUUID().slice(0, 8),
      title: `Scene ${story.scenes.length + 1}`,
      base_text: 'Enter scene text...',
      choices: [
        { kind: 'damage', text: 'Choice 1', amount: 1 },
        { kind: 'item', text: 'Choice 2', amount: 1, item_name: 'Item' },
        { kind: 'level', text: 'Choice 3', amount: 1 }
      ],
      conditional_text: []
    }
    setStory({ ...story, scenes: [...story.scenes, newScene] })
    setSelectedSceneId(newScene.id)
    setEditingOpeningScene(false)
  }

  function handleDeleteScene() {
    if (!story || !deleteSceneTarget) return
    const sceneId = deleteSceneTarget
    setDeleteSceneTarget(null)
    const newScenes = story.scenes.filter(s => s.id !== sceneId)
    setStory({ ...story, scenes: newScenes })
    if (selectedSceneId === sceneId) {
      setSelectedSceneId(newScenes[0]?.id ?? null)
    }
  }

  function updateChoice(sceneId: string, choiceIndex: number, updates: Partial<Choice>) {
    if (!story) return
    setStory({
      ...story,
      scenes: story.scenes.map(s => {
        if (s.id !== sceneId) return s
        return {
          ...s,
          choices: s.choices.map((c, i) => i === choiceIndex ? { ...c, ...updates } : c)
        }
      })
    })
  }

  function updateOpeningScene(updates: Partial<OpeningScene>) {
    if (!story || !story.opening_scene) return
    setStory({ ...story, opening_scene: { ...story.opening_scene, ...updates } })
  }

  function toggleOpeningScene(enabled: boolean) {
    if (!story) return
    if (enabled) {
      setStory({
        ...story,
        opening_scene: {
          title: 'Prologue',
          base_text: 'Enter opening scene text...',
          choices: [],
          conditional_text: []
        }
      })
      setEditingOpeningScene(true)
      setSelectedSceneId(null)
    } else {
      setStory({ ...story, opening_scene: undefined })
      setEditingOpeningScene(false)
      if (story.scenes.length > 0) {
        setSelectedSceneId(story.scenes[0].id)
      }
    }
  }

  function addOpeningChoice() {
    if (!story || !story.opening_scene || story.opening_scene.choices.length >= 3) return
    const newChoice: OpeningChoice = { text: 'New choice', target_scene_id: undefined }
    setStory({
      ...story,
      opening_scene: {
        ...story.opening_scene,
        choices: [...story.opening_scene.choices, newChoice]
      }
    })
  }

  function updateOpeningChoice(index: number, updates: Partial<OpeningChoice>) {
    if (!story || !story.opening_scene) return
    setStory({
      ...story,
      opening_scene: {
        ...story.opening_scene,
        choices: story.opening_scene.choices.map((c, i) => i === index ? { ...c, ...updates } : c)
      }
    })
  }

  function deleteOpeningChoice(index: number) {
    if (!story || !story.opening_scene) return
    setStory({
      ...story,
      opening_scene: {
        ...story.opening_scene,
        choices: story.opening_scene.choices.filter((_, i) => i !== index)
      }
    })
  }

  const selectedScene = story?.scenes.find(s => s.id === selectedSceneId)

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: 'var(--space-xl)' }}>
        <p>Loading...</p>
      </div>
    )
  }

  if (!story) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: 'var(--space-xl)' }}>
        <h1>Story not found</h1>
        <button className="btn" onClick={() => navigate('/')}>Go to Library</button>
      </div>
    )
  }

  return (
    <>
      <nav className="nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', minWidth: 0 }}>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? '✕' : '☰'}
          </button>
          <span className="nav__title">Editing: {story.title}</span>
        </div>
        <div className="nav__actions">
          <button className="btn btn--secondary" onClick={() => navigate('/')}>
            Back
          </button>
          <button className="btn" onClick={saveStory} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <ModeToggle colorMode={colorMode} onToggle={toggleColorMode} />
        </div>
      </nav>

      {/* Sidebar overlay (mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <div className="container editor-layout">
        {/* Sidebar */}
        <aside className={`editor-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
          {/* Story Settings */}
          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Story Settings</h3>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label htmlFor="story-title" className="label">Title</label>
              <input
                id="story-title"
                type="text"
                className="input"
                value={story.title}
                onChange={e => updateStory({ title: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label htmlFor="story-theme" className="label">Theme</label>
              <select
                id="story-theme"
                className="input"
                value={story.theme}
                onChange={e => {
                  const theme = e.target.value as ThemeName
                  updateStory({ theme })
                  setTheme(theme)
                }}
                style={{ width: '100%' }}
              >
                {THEMES.map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label htmlFor="starting-hp" className="label">Starting HP</label>
              <input
                id="starting-hp"
                type="number"
                className="input"
                value={story.settings.starting_hp}
                onChange={e => updateStory({ settings: { ...story.settings, starting_hp: parseInt(e.target.value) || 3 } })}
                min={1}
                max={10}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={story.settings.non_linear}
                  onChange={e => updateStory({ settings: { ...story.settings, non_linear: e.target.checked } })}
                />
                Non-linear story
              </label>
            </div>
          </div>

          {/* Opening Scene */}
          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3>Opening Scene</h3>
              <label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!story.opening_scene}
                  onChange={e => toggleOpeningScene(e.target.checked)}
                />
                Enable
              </label>
            </div>
            {story.opening_scene && (
              <button
                onClick={() => {
                  setEditingOpeningScene(true)
                  setSelectedSceneId(null)
                }}
                style={{
                  width: '100%',
                  padding: 'var(--space-sm)',
                  textAlign: 'left',
                  background: editingOpeningScene ? 'var(--accent)' : 'var(--bg-primary)',
                  color: editingOpeningScene ? 'var(--text-on-accent)' : 'var(--text-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  minHeight: '44px'
                }}
              >
                {story.opening_scene.title}
              </button>
            )}
          </div>

          {/* Scene List */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3>Scenes</h3>
              <button className="btn btn--secondary text-sm" onClick={addScene} style={{ padding: 'var(--space-xs) var(--space-sm)' }}>
                + Add
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {story.scenes.map((scene, i) => (
                <button
                  key={scene.id}
                  onClick={() => {
                    setSelectedSceneId(scene.id)
                    setEditingOpeningScene(false)
                  }}
                  style={{
                    padding: 'var(--space-sm)',
                    textAlign: 'left',
                    background: selectedSceneId === scene.id && !editingOpeningScene ? 'var(--accent)' : 'var(--bg-primary)',
                    color: selectedSceneId === scene.id && !editingOpeningScene ? 'var(--text-on-accent)' : 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    minHeight: '44px'
                  }}
                >
                  {i + 1}. {scene.title}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Editor */}
        <main className="editor-main">
          {/* Opening Scene Editor */}
          {editingOpeningScene && story.opening_scene && (
            <div className="card">
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                <input
                  type="text"
                  className="input font-semibold"
                  value={story.opening_scene.title}
                  onChange={e => updateOpeningScene({ title: e.target.value })}
                  aria-label="Opening scene title"
                  style={{ fontSize: 'var(--text-xl)', flex: '1 1 200px', minWidth: 0 }}
                />
                <button
                  className="btn btn--secondary text-danger"
                  onClick={() => toggleOpeningScene(false)}
                >
                  Remove
                </button>
              </div>

              {/* Opening Scene Text */}
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label htmlFor="opening-scene-text" className="label">
                  Scene Text
                </label>
                <textarea
                  id="opening-scene-text"
                  className="input"
                  value={story.opening_scene.base_text}
                  onChange={e => updateOpeningScene({ base_text: e.target.value })}
                  rows={6}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {/* Opening Choices */}
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                  <h4>Choices (optional)</h4>
                  {story.opening_scene.choices.length < 3 && (
                    <button
                      className="btn btn--secondary text-sm"
                      onClick={addOpeningChoice}
                      style={{ padding: 'var(--space-xs) var(--space-sm)' }}
                    >
                      + Add Choice
                    </button>
                  )}
                </div>
                <p className="text-sm text-secondary" style={{ marginBottom: 'var(--space-md)' }}>
                  If no choices are added, players will see a "Choose Your Path" button.
                </p>
                {story.opening_scene.choices.map((choice, i) => (
                  <div key={i} className="card" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'start', gap: 'var(--space-md)' }}>
                      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                        <label className="label label--xs">
                          Choice Text
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={choice.text}
                          onChange={e => updateOpeningChoice(i, { text: e.target.value })}
                          style={{ width: '100%', marginBottom: 'var(--space-sm)' }}
                        />
                        <label className="label label--xs">
                          Target Scene
                        </label>
                        <select
                          className="input"
                          value={choice.target_scene_id || ''}
                          onChange={e => updateOpeningChoice(i, { target_scene_id: e.target.value || undefined })}
                          style={{ width: '100%' }}
                        >
                          <option value="">Scene Selection (player chooses)</option>
                          {story.scenes.map(s => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="btn btn--secondary text-danger"
                        onClick={() => deleteOpeningChoice(i)}
                        style={{ padding: 'var(--space-xs) var(--space-sm)' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scene Editor */}
          {selectedScene && !editingOpeningScene && (
            <div className="card">
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                <input
                  type="text"
                  className="input font-semibold"
                  value={selectedScene.title}
                  onChange={e => updateScene(selectedScene.id, { title: e.target.value })}
                  aria-label="Scene title"
                  style={{ fontSize: 'var(--text-xl)', flex: '1 1 200px', minWidth: 0 }}
                />
                <button
                  className="btn btn--secondary text-danger"
                  onClick={() => setDeleteSceneTarget(selectedScene.id)}
                  disabled={story.scenes.length <= 1}
                >
                  Delete
                </button>
              </div>

              {/* Scene Text */}
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label htmlFor="scene-text" className="label">
                  Scene Text
                </label>
                <textarea
                  id="scene-text"
                  className="input"
                  value={selectedScene.base_text}
                  onChange={e => updateScene(selectedScene.id, { base_text: e.target.value })}
                  rows={6}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {/* Choices */}
              <div>
                <h4 style={{ marginBottom: 'var(--space-md)' }}>Choices</h4>
                {selectedScene.choices.map((choice, i) => (
                  <div key={i} className="card" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)' }}>
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 'var(--space-md)', alignItems: 'start' }}>
                      <div>
                        <label className="label label--xs">
                          Type
                        </label>
                        <select
                          className="input"
                          value={choice.kind}
                          onChange={e => updateChoice(selectedScene.id, i, { kind: e.target.value as ChoiceKind })}
                          style={{ width: '100%' }}
                        >
                          <option value="damage">Damage</option>
                          <option value="item">Item</option>
                          <option value="level">Level</option>
                        </select>
                      </div>
                      <div>
                        <label className="label label--xs">
                          Text
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={choice.text}
                          onChange={e => updateChoice(selectedScene.id, i, { text: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    {choice.kind === 'item' && (
                      <div style={{ marginTop: 'var(--space-sm)' }}>
                        <label className="label label--xs">
                          Item Name
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={choice.item_name || ''}
                          onChange={e => updateChoice(selectedScene.id, i, { item_name: e.target.value })}
                          style={{ width: '100%', maxWidth: '200px' }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when nothing selected */}
          {!selectedScene && !editingOpeningScene && (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
              <p className="text-secondary">Select a scene to edit or add a new one.</p>
            </div>
          )}
        </main>
      </div>

      {/* Delete Scene Confirmation */}
      <ConfirmDialog
        isOpen={deleteSceneTarget !== null}
        onConfirm={handleDeleteScene}
        onCancel={() => setDeleteSceneTarget(null)}
        title="Delete Scene?"
        message={`Are you sure you want to delete "${story.scenes.find(s => s.id === deleteSceneTarget)?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </>
  )
}
