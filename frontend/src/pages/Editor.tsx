import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import * as api from '../hooks/api'
import type { Story, Scene, Choice, ThemeName, ChoiceKind } from '../types'

const THEMES: ThemeName[] = ['cyberpunk', 'fantasy', 'deep_space', 'modern', 'horror', 'insanity']

export default function Editor() {
  const { storyId } = useParams<{ storyId: string }>()
  const navigate = useNavigate()
  const { toggleColorMode, setTheme } = useGame()

  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)

  useEffect(() => {
    if (storyId) {
      loadStory(storyId)
    }
  }, [storyId])

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
  }

  function deleteScene(sceneId: string) {
    if (!story || story.scenes.length <= 1) return
    if (!confirm('Delete this scene?')) return
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
        <span className="nav__title">Editing: {story.title}</span>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <button className="btn btn--secondary" onClick={() => navigate('/')}>
            Back
          </button>
          <button className="btn" onClick={saveStory} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="btn btn--secondary mode-toggle" onClick={toggleColorMode} aria-label="Toggle light/dark mode" />
        </div>
      </nav>

      <div className="container" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 'var(--space-lg)', paddingTop: 'var(--space-lg)' }}>
        {/* Sidebar */}
        <aside>
          {/* Story Settings */}
          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ marginBottom: 'var(--space-md)' }}>Story Settings</h3>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem' }}>Title</label>
              <input
                type="text"
                className="input"
                value={story.title}
                onChange={e => updateStory({ title: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem' }}>Theme</label>
              <select
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
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem' }}>Starting HP</label>
              <input
                type="number"
                className="input"
                value={story.settings.starting_hp}
                onChange={e => updateStory({ settings: { ...story.settings, starting_hp: parseInt(e.target.value) || 3 } })}
                min={1}
                max={10}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Scene List */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
              <h3>Scenes</h3>
              <button className="btn btn--secondary" onClick={addScene} style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.875rem' }}>
                + Add
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {story.scenes.map((scene, i) => (
                <button
                  key={scene.id}
                  onClick={() => setSelectedSceneId(scene.id)}
                  style={{
                    padding: 'var(--space-sm)',
                    textAlign: 'left',
                    background: selectedSceneId === scene.id ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: selectedSceneId === scene.id ? 'white' : 'var(--text-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer'
                  }}
                >
                  {i + 1}. {scene.title}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Editor */}
        <main>
          {selectedScene && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                <input
                  type="text"
                  className="input"
                  value={selectedScene.title}
                  onChange={e => updateScene(selectedScene.id, { title: e.target.value })}
                  style={{ fontSize: '1.25rem', fontWeight: 600, flex: 1, marginRight: 'var(--space-md)' }}
                />
                <button
                  className="btn btn--secondary"
                  onClick={() => deleteScene(selectedScene.id)}
                  style={{ color: 'var(--danger)' }}
                  disabled={story.scenes.length <= 1}
                >
                  Delete Scene
                </button>
              </div>

              {/* Scene Text */}
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Scene Text
                </label>
                <textarea
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
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 'var(--space-md)', alignItems: 'start' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
                        <label style={{ display: 'block', marginBottom: 'var(--space-xs)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Item Name
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={choice.item_name || ''}
                          onChange={e => updateChoice(selectedScene.id, i, { item_name: e.target.value })}
                          style={{ width: '200px' }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
