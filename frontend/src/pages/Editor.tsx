import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../context/useGame'
import { MOODS } from '../lib/themes'
import { insertAtCursor } from '../lib/insertAtCursor'
import * as api from '../hooks/api'
import { useAutoSave } from '../hooks/useAutoSave'
import { THEMES, type Story, type Scene, type Choice, type ThemeName, type OpeningScene, type OpeningChoice, type MadLibField } from '../types'
import { ConfirmDialog, ModeToggle, Collapsible } from '../components'
import '../styles/pages/editor.css'


// Built-in character creation presets with indirect, creative questions
const BUILTIN_PRESETS: Record<string, { name: string; prompt: string; fields: MadLibField[] }> = {
  classic_hero: {
    name: 'Classic Hero',
    prompt: '{name} the {profession} has a secret weakness: {weakness}. They journey forth to {quest}.',
    fields: [
      { key: 'name', label: 'If you could name a constellation, what would you call it?', hint: 'a name' },
      { key: 'profession', label: "What job would you do if money didn't matter?", hint: 'a job or role' },
      { key: 'weakness', label: 'What keeps you up at 3am?', hint: 'a fear or worry' },
      { key: 'quest', label: 'If you had one wish, what would it be?', hint: 'a goal' }
    ]
  },
  mysterious_stranger: {
    name: 'Mysterious Stranger',
    prompt: 'They go by {alias}, but no one knows their true name. They carry the weight of {secret} and fear nothing except {fear}. Now they seek {goal}.',
    fields: [
      { key: 'alias', label: 'What would your spy codename be?', hint: 'a name or title' },
      { key: 'secret', label: "What's something you've never told anyone?", hint: 'a secret' },
      { key: 'fear', label: 'What sound makes you uncomfortable?', hint: 'something unsettling' },
      { key: 'goal', label: 'What would you search for in an abandoned library?', hint: 'something valuable' }
    ]
  },
  unlikely_champion: {
    name: 'Unlikely Champion',
    prompt: '{name} was just a simple {job} until they discovered they could {talent}. Now, driven by {motivation}, they must become something more.',
    fields: [
      { key: 'name', label: 'What name would you give to a friendly ghost?', hint: 'a name' },
      { key: 'job', label: "What's the most boring job you can think of?", hint: 'a mundane job' },
      { key: 'talent', label: 'What would be an absurd superpower?', hint: 'an unusual ability' },
      { key: 'motivation', label: 'What makes you get out of bed in the morning?', hint: 'a driving force' }
    ]
  },
  fallen_noble: {
    name: 'Fallen Noble',
    prompt: 'Once known as {title}, they ruled over {domain}. But {downfall} stripped everything away. Now they wander, seeking {redemption}.',
    fields: [
      { key: 'title', label: 'What would your royal title be?', hint: 'a title or honorific' },
      { key: 'domain', label: 'What place feels like home to you?', hint: 'a place' },
      { key: 'downfall', label: "What's the worst way to lose a game?", hint: 'a way to fail' },
      { key: 'redemption', label: 'What would you do with a second chance?', hint: 'an action or goal' }
    ]
  },
  scrappy_survivor: {
    name: 'Scrappy Survivor',
    prompt: 'On the streets they call them {nickname}. They grew up in {origin} and learned to survive by {skill}. But deep down, they dream of {dream}.',
    fields: [
      { key: 'nickname', label: 'What nickname did you have as a kid?', hint: 'a nickname' },
      { key: 'origin', label: 'Describe a place that smells like memories.', hint: 'a place description' },
      { key: 'skill', label: "What's something you're surprisingly good at?", hint: 'a skill' },
      { key: 'dream', label: 'What would you do if you won the lottery?', hint: 'a dream or wish' }
    ]
  }
}

export default function Editor() {
  const { storyId } = useParams<{ storyId: string }>()
  const navigate = useNavigate()
  const { toggleColorMode, colorMode, setTheme } = useGame()

  const [story, setStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [editingOpeningScene, setEditingOpeningScene] = useState(false)
  const [editingCharacterCreation, setEditingCharacterCreation] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [deleteSceneTarget, setDeleteSceneTarget] = useState<string | null>(null)
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({})
  const [showPreview, setShowPreview] = useState(false)
  const [itemPreviewAcquired, setItemPreviewAcquired] = useState<Record<string, boolean>>({})

  // Refs for finale textareas to support click-to-insert
  const victoryTextRef = useRef<HTMLTextAreaElement>(null)
  const defeatTextRef = useRef<HTMLTextAreaElement>(null)
  const activeFinaleTextarea = useRef<'victory' | 'defeat' | null>(null)

  // Get all available item names from the story (for item_texts dropdowns)
  const availableItems: string[] = story?.scenes.flatMap(scene =>
    scene.choices
      .filter(choice => choice.kind === 'item' && choice.item_name)
      .map(choice => choice.item_name!)
  ) ?? []

  useEffect(() => {
    if (storyId) {
      loadStory(storyId)
    }
  }, [storyId])

  // Close sidebar when a scene is selected (mobile)
  useEffect(() => {
    if (selectedSceneId || editingOpeningScene || editingCharacterCreation) {
      setSidebarOpen(false)
    }
  }, [selectedSceneId, editingOpeningScene, editingCharacterCreation])

  async function loadStory(id: string) {
    try {
      const data = await api.getStory(id)
      setStory(data)
      setTheme('modern')
      if (data.scenes.length > 0) {
        setSelectedSceneId(data.scenes[0].id)
      }
    } catch (err) {
      console.error('Failed to load story:', err)
    } finally {
      setLoading(false)
    }
  }

  // Save function for auto-save hook
  const saveStory = useCallback(async () => {
    if (!story) return
    await api.updateStory(story.id, story)
  }, [story])

  // Auto-save with debounce
  const { status: saveStatus, saveNow, statusRef, saveNowRef } = useAutoSave({
    data: story,
    onSave: saveStory,
    debounceMs: 2000,
    enabled: !loading && story !== null
  })

  // What would stop this story from being played, re-checked after every save
  const [problems, setProblems] = useState<string[]>([])
  const [showProblems, setShowProblems] = useState(false)
  useEffect(() => {
    if (!storyId || saveStatus !== 'saved') return
    let cancelled = false
    api.getStoryProblems(storyId)
      .then(r => { if (!cancelled) setProblems(r.problems) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [storyId, saveStatus])

  // Warn on browser/tab close if unsaved
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current === 'unsaved') {
        e.preventDefault()
        return ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [statusRef])

  // Save on unmount (navigation away)
  useEffect(() => {
    return () => {
      if (statusRef.current === 'unsaved') {
        saveNowRef.current()
      }
    }
  }, [statusRef, saveNowRef])

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
        { kind: 'damage', display_text: 'Do you choose to...', result_text: 'The consequence...', amount: 1 },
        { kind: 'item', display_text: 'Do you choose to...', result_text: 'The consequence...', amount: 1, item_name: 'Item' },
        { kind: 'level', display_text: 'Do you choose to...', result_text: 'The consequence...', amount: 1 }
      ],
      conditional_text: []
    }
    setStory({ ...story, scenes: [...story.scenes, newScene] })
    setSelectedSceneId(newScene.id)
    setEditingOpeningScene(false)
  }

  // Scene order is play order in linear stories
  function moveScene(sceneId: string, delta: -1 | 1) {
    if (!story) return
    const index = story.scenes.findIndex(s => s.id === sceneId)
    const target = index + delta
    if (index < 0 || target < 0 || target >= story.scenes.length) return
    const scenes = [...story.scenes]
    ;[scenes[index], scenes[target]] = [scenes[target], scenes[index]]
    setStory({ ...story, scenes })
  }

  // The text field the author was last typing in, for the {key} insert chips
  const lastTextField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  function rememberTextField(e: React.FocusEvent) {
    const el = e.target
    if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text')) {
      lastTextField.current = el
    }
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

  // Extract {key} placeholders from template text
  function extractKeysFromTemplate(prompt: string): string[] {
    const matches = prompt.match(/\{(\w+)\}/g) || []
    return [...new Set(matches.map(m => m.slice(1, -1)))]
  }

  // Update template with auto-detection of fields
  function updateMadLibTemplateWithAutoDetect(newPrompt: string) {
    if (!story) return
    const detectedKeys = extractKeysFromTemplate(newPrompt)

    // Preserve existing field data where keys match
    const existingFieldsMap = new Map(story.madlib_template.fields.map(f => [f.key, f]))

    // Build new fields array: detected keys in order, preserving existing labels/hints
    const newFields: MadLibField[] = detectedKeys.map(key => {
      const existing = existingFieldsMap.get(key)
      if (existing) return existing
      return { key, label: `Enter a ${key}`, hint: '' }
    })

    setStory({
      ...story,
      madlib_template: { prompt: newPrompt, fields: newFields }
    })
  }

  function updateMadLibField(index: number, updates: Partial<MadLibField>) {
    if (!story) return
    setStory({
      ...story,
      madlib_template: {
        ...story.madlib_template,
        fields: story.madlib_template.fields.map((f, i) => i === index ? { ...f, ...updates } : f)
      }
    })
  }

  function applyPreset(presetKey: string) {
    if (!story) return
    const preset = BUILTIN_PRESETS[presetKey]
    if (!preset) return

    setStory({
      ...story,
      madlib_template: {
        prompt: preset.prompt,
        fields: preset.fields.map(f => ({ ...f }))
      }
    })
    setPreviewValues({})
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  // Insert item template at cursor position in the active finale textarea
  function insertItemTemplate(itemName: string) {
    const template = `{item_text:${itemName}}`
    const ref = activeFinaleTextarea.current === 'victory' ? victoryTextRef : defeatTextRef
    const textarea = ref.current
    if (!textarea || !selectedSceneId) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentValue = textarea.value
    const newValue = currentValue.slice(0, start) + template + currentValue.slice(end)

    const field = activeFinaleTextarea.current === 'victory' ? 'victory_text' : 'defeat_text'
    updateScene(selectedSceneId, { [field]: newValue })

    // Restore cursor position after the inserted template
    requestAnimationFrame(() => {
      textarea.focus()
      const newPos = start + template.length
      textarea.setSelectionRange(newPos, newPos)
    })
  }

  // Get preview text with sample values filled in
  function getPreviewText(): string {
    if (!story) return ''
    let text = story.madlib_template.prompt
    for (const field of story.madlib_template.fields) {
      const value = previewValues[field.key] || `[${field.key}]`
      text = text.replace(new RegExp(`\\{${field.key}\\}`, 'g'), value)
    }
    return text
  }

  // Find where each field key is used across scenes
  function getVariableUsage(key: string): { sceneId: string; sceneTitle: string; location: string }[] {
    if (!story) return []
    const usages: { sceneId: string; sceneTitle: string; location: string }[] = []
    const pattern = new RegExp(`\\{${key}\\}`)

    for (const scene of story.scenes) {
      if (pattern.test(scene.base_text)) {
        usages.push({ sceneId: scene.id, sceneTitle: scene.title, location: 'scene text' })
      }
      for (const choice of scene.choices) {
        if (pattern.test(choice.display_text) || pattern.test(choice.result_text)) {
          usages.push({ sceneId: scene.id, sceneTitle: scene.title, location: 'choice' })
          break
        }
      }
      for (const ct of scene.conditional_text) {
        if (pattern.test(ct.text)) {
          usages.push({ sceneId: scene.id, sceneTitle: scene.title, location: 'conditional' })
          break
        }
      }
    }
    return usages
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
    <div className="editor-page">
      <nav className="nav">
        <div className="editor-nav-left">
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
          {problems.length > 0 && (
            <button
              className="btn btn--secondary text-warning"
              onClick={() => setShowProblems(!showProblems)}
              aria-expanded={showProblems}
              aria-controls="story-problems"
            >
              {problems.length} {problems.length === 1 ? 'problem' : 'problems'}
            </button>
          )}
          <span className={`save-status save-status--${saveStatus}`}>
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'unsaved' && 'Unsaved'}
          </span>
          <button className="btn" onClick={saveNow} disabled={saveStatus === 'saving'}>
            Save Now
          </button>
          <ModeToggle colorMode={colorMode} onToggle={toggleColorMode} />
        </div>
      </nav>

      {showProblems && problems.length > 0 && (
        <div id="story-problems" className="alert alert--warning editor-problems" role="status">
          <div>
            <strong>This story can't be played yet:</strong>
            <ul>
              {problems.map(p => <li key={p}>{p}</li>)}
            </ul>
          </div>
          <button className="btn btn--secondary text-sm" onClick={() => setShowProblems(false)}>Hide</button>
        </div>
      )}

      {/* Sidebar overlay (mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <div className="editor-body">
        {/* Sidebar */}
        <aside className={`editor-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
          {/* Story Settings */}
          <div className="card">
            <h3>Story Settings</h3>
            <div className="editor-field">
              <label htmlFor="story-title" className="label">Title</label>
              <input
                id="story-title"
                type="text"
                className="input"
                value={story.title}
                onChange={e => updateStory({ title: e.target.value })}
              />
            </div>
            <div className="editor-field">
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
              >
                {THEMES.map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="editor-field">
              <label htmlFor="starting-hp" className="label">Starting HP</label>
              <input
                id="starting-hp"
                type="number"
                className="input"
                value={story.settings.starting_hp}
                onChange={e => updateStory({ settings: { ...story.settings, starting_hp: parseInt(e.target.value) || 3 } })}
                min={1}
                max={10}
              />
            </div>
            <div>
              <label className="editor-checkbox">
                <input
                  type="checkbox"
                  checked={story.settings.non_linear}
                  onChange={e => updateStory({ settings: { ...story.settings, non_linear: e.target.checked } })}
                />
                Non-linear story
              </label>
            </div>
          </div>

          {/* Character Creation - Compact Summary */}
          <div className="card">
            <h3>Character Creation</h3>
            <p className="text-sm text-secondary" style={{ marginBottom: 'var(--space-sm)' }}>
              {story.madlib_template.fields.length === 0
                ? 'No character questions defined'
                : `${story.madlib_template.fields.length} question${story.madlib_template.fields.length === 1 ? '' : 's'} defined`
              }
            </p>
            <button
              className="btn btn--secondary btn--full"
              onClick={() => {
                setEditingCharacterCreation(true)
                setEditingOpeningScene(false)
                setSelectedSceneId(null)
              }}
            >
              Edit Character Creation
            </button>
          </div>

          {/* Opening Scene */}
          <div className="card">
            <div className="editor-opening-header">
              <h3>Opening Scene</h3>
              <label className="editor-opening-enable">
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
                className={`editor-scene-btn ${editingOpeningScene ? 'editor-scene-btn--selected' : 'editor-scene-btn--default'}`}
                onClick={() => {
                  setEditingOpeningScene(true)
                  setSelectedSceneId(null)
                  setEditingCharacterCreation(false)
                }}
              >
                {story.opening_scene.title}
              </button>
            )}
          </div>

          {/* Scene List */}
          <div className="card">
            <div className="editor-scenes-header">
              <h3>Scenes</h3>
              <button className="btn btn--secondary btn--sm" onClick={addScene}>
                + Add
              </button>
            </div>
            <div className="editor-scene-list">
              {story.scenes.map((scene, i) => (
                <div key={scene.id} className="editor-scene-row">
                  <button
                    className={`editor-scene-btn ${selectedSceneId === scene.id && !editingOpeningScene ? 'editor-scene-btn--selected' : 'editor-scene-btn--default'}`}
                    onClick={() => {
                      setSelectedSceneId(scene.id)
                      setEditingOpeningScene(false)
                      setEditingCharacterCreation(false)
                    }}
                  >
                    {i + 1}. {scene.title} {scene.is_finale && <span className="text-xs" style={{ opacity: 0.7 }}>(finale)</span>}
                  </button>
                  <div className="editor-scene-move">
                    <button onClick={() => moveScene(scene.id, -1)} disabled={i === 0} aria-label={`Move ${scene.title} up`}>▲</button>
                    <button onClick={() => moveScene(scene.id, 1)} disabled={i === story.scenes.length - 1} aria-label={`Move ${scene.title} down`}>▼</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Editor */}
        <main className="editor-main" onFocusCapture={rememberTextField}>
          {/* Character Creation Editor */}
          {editingCharacterCreation && (
            <div className="card">
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                <h2 style={{ margin: 0 }}>Character Creation</h2>
                <button
                  className="btn btn--secondary"
                  onClick={() => {
                    setEditingCharacterCreation(false)
                    if (story.scenes.length > 0) {
                      setSelectedSceneId(story.scenes[0].id)
                    }
                  }}
                >
                  Done
                </button>
              </div>

              {/* Presets */}
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="label">Start from a preset</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                  {Object.entries(BUILTIN_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      className="btn btn--secondary text-sm"
                      onClick={() => applyPreset(key)}
                      style={{ padding: 'var(--space-xs) var(--space-md)' }}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-secondary">
                  Click a preset to load it, then customize below.
                </p>
              </div>

              {/* Template Text */}
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label htmlFor="char-template" className="label">
                  Character Description Template
                </label>
                <textarea
                  id="char-template"
                  className="input"
                  value={story.madlib_template.prompt}
                  onChange={e => updateMadLibTemplateWithAutoDetect(e.target.value)}
                  rows={5}
                  placeholder="Use {key} to define placeholders. Example: '{name} the {profession} seeks {goal}...'"
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
                />
                <p className="text-xs text-secondary" style={{ marginTop: 'var(--space-xs)' }}>
                  Type {'{key}'} to create placeholders. Fields are auto-detected.
                </p>
              </div>

              {/* Preview Toggle */}
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showPreview}
                    onChange={e => setShowPreview(e.target.checked)}
                  />
                  Show live preview
                </label>
                {showPreview && (
                  <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontStyle: 'italic' }}>
                    {getPreviewText() || <span className="text-secondary">Enter template text above...</span>}
                  </div>
                )}
              </div>

              {/* Fields */}
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                  <label className="label" style={{ margin: 0 }}>
                    Fields ({story.madlib_template.fields.length})
                  </label>
                </div>

                {story.madlib_template.fields.length === 0 ? (
                  <p className="text-secondary" style={{ padding: 'var(--space-lg)', textAlign: 'center', border: '1px dashed var(--text-secondary)', borderRadius: 'var(--radius-md)' }}>
                    No fields yet. Add {'{key}'} placeholders to the template above.
                  </p>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {story.madlib_template.fields.map((field, i) => {
                      const usages = getVariableUsage(field.key)
                      return (
                        <Collapsible
                          key={field.key}
                          title={<code style={{ color: 'var(--accent)', fontWeight: 600 }}>{'{' + field.key + '}'}</code>}
                          preview={field.label || 'No question yet...'}
                          defaultOpen={i === 0}
                        >
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-sm)' }}>
                            <button
                              className="btn btn--secondary text-xs"
                              onClick={() => copyToClipboard(`{${field.key}}`)}
                              title="Copy to clipboard"
                              style={{ padding: 'var(--space-xs) var(--space-sm)' }}
                            >
                              Copy
                            </button>
                          </div>

                          <div className="editor-choice-field">
                            <label className="label label--xs">Question shown to players</label>
                            <input
                              type="text"
                              className="input"
                              value={field.label}
                              onChange={e => updateMadLibField(i, { label: e.target.value })}
                              placeholder="Write an indirect question..."
                            />
                          </div>

                          <div className="editor-choice-field">
                            <label className="label label--xs">Hint (grammar guidance)</label>
                            <input
                              type="text"
                              className="input"
                              value={field.hint || ''}
                              onChange={e => updateMadLibField(i, { hint: e.target.value })}
                              placeholder="e.g., a name, verb past tense, noun plural"
                            />
                          </div>

                          {showPreview && (
                            <div className="editor-choice-field">
                              <label className="label label--xs">Preview value</label>
                              <input
                                type="text"
                                className="input"
                                value={previewValues[field.key] || ''}
                                onChange={e => setPreviewValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                placeholder={`Sample ${field.key}...`}
                              />
                            </div>
                          )}

                          {usages.length > 0 && (
                            <p className="text-xs text-secondary">
                              Used in: {usages.map(u => u.sceneTitle).join(', ')}
                            </p>
                          )}
                        </Collapsible>
                      )
                    })}
                  </div>
                  </div>
                )}
              </div>

              {/* Question Writing Tips */}
              <details style={{ marginBottom: 'var(--space-lg)', border: '1px solid var(--text-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 500, color: 'var(--accent)' }}>
                  Question Writing Tips
                </summary>
                <div style={{ marginTop: 'var(--space-md)', color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                  <p style={{ marginBottom: 'var(--space-sm)' }}>
                    <strong>Make questions indirect!</strong> Don't reveal how answers will be used.
                  </p>
                  <ul style={{ marginLeft: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                    <li>Instead of "What's your weakness?" ask "What keeps you up at 3am?"</li>
                    <li>Instead of "What's your goal?" ask "If you had one wish, what would it be?"</li>
                    <li>Instead of "What's your job?" ask "What would you do if money didn't matter?"</li>
                    <li>Instead of "What's your fear?" ask "What sound makes you uncomfortable?"</li>
                    <li>Instead of "Where are you from?" ask "Describe a place that smells like memories."</li>
                  </ul>
                  <p>The magic happens when players don't know how their answers will be woven into the story!</p>
                </div>
              </details>
            </div>
          )}

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
                            <option key={s.id} value={s.id}>{s.display_name || s.title}</option>
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
              <div className="editor-card-header">
                <input
                  type="text"
                  className="input"
                  value={selectedScene.title}
                  onChange={e => updateScene(selectedScene.id, { title: e.target.value })}
                  aria-label="Scene title"
                />
                <button
                  className="btn btn--secondary text-danger"
                  onClick={() => setDeleteSceneTarget(selectedScene.id)}
                  disabled={story.scenes.length <= 1}
                >
                  Delete
                </button>
              </div>

              {/* Character details: click to insert {key} where you were typing */}
              {story.madlib_template.fields.length > 0 && (
                <div className="editor-keys" role="toolbar" aria-label="Insert a character detail">
                  <span className="text-secondary text-xs">Insert a character detail:</span>
                  {story.madlib_template.fields.map(f => (
                    <button
                      key={f.key}
                      type="button"
                      className="editor-key"
                      title={f.label}
                      // Keep focus (and the cursor) in the text field being edited
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => lastTextField.current?.isConnected && insertAtCursor(lastTextField.current, `{${f.key}}`)}
                    >
                      {`{${f.key}}`}
                    </button>
                  ))}
                </div>
              )}

              {/* Display Name (for scene selection) */}
              <div className="editor-field">
                <label htmlFor="scene-display-name" className="label">
                  Display Name <span className="text-secondary text-xs">(poetic name for scene selection)</span>
                </label>
                <input
                  id="scene-display-name"
                  type="text"
                  className="input"
                  value={selectedScene.display_name || ''}
                  onChange={e => updateScene(selectedScene.id, { display_name: e.target.value || undefined })}
                  placeholder="e.g., The door with the cracked mirror symbol..."
                />
              </div>

              {/* Backdrop mood: the atmosphere behind this scene on every screen */}
              <div className="editor-field">
                <label htmlFor="scene-mood" className="label">
                  Backdrop <span className="text-secondary text-xs">(the atmosphere players see during this scene)</span>
                </label>
                <select
                  id="scene-mood"
                  className="input"
                  value={selectedScene.mood ?? ''}
                  onChange={e => updateScene(selectedScene.id, { mood: e.target.value || null })}
                >
                  <option value="">Automatic (varies by scene)</option>
                  {MOODS[story.theme].map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>

              {/* Scene Text - shown for all scenes */}
              <div className="editor-section editor-scene-text">
                <label htmlFor="scene-text" className="label">
                  Scene Text
                </label>
                <textarea
                  id="scene-text"
                  className="input"
                  value={selectedScene.base_text}
                  onChange={e => updateScene(selectedScene.id, { base_text: e.target.value })}
                  rows={6}
                />
              </div>

              {/* Finale Scene Toggle */}
              <div className="editor-field">
                <label className="editor-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedScene.is_finale || false}
                    onChange={e => updateScene(selectedScene.id, {
                      is_finale: e.target.checked,
                      // Clear choices when marking as finale
                      choices: e.target.checked ? [] : selectedScene.choices
                    })}
                  />
                  This is a finale scene (die-roll ending, no choices)
                </label>
              </div>

              {/* Finale Fields - only shown when is_finale is true */}
              {selectedScene.is_finale && (
                <div style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <h4 style={{ marginBottom: 'var(--space-md)' }}>Finale Settings</h4>

                  {/* Items Reference */}
                  {availableItems.length > 0 && (
                    <div style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-sm)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--text-secondary)' }}>
                      <div className="text-xs text-secondary" style={{ marginBottom: 'var(--space-xs)' }}>
                        Items in this story (click to insert at cursor in victory/defeat text blocks):
                      </div>
                      <div className="text-sm" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
                        {availableItems.map(item => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => insertItemTemplate(item)}
                            style={{
                              padding: '2px 6px',
                              background: 'var(--bg-secondary)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 'var(--text-xs)',
                              border: '1px solid var(--text-secondary)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer'
                            }}
                            title={`Insert {item_text:${item}}`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 'var(--space-md)' }}>
                    <label htmlFor="finale-setup" className="label">
                      Setup Text <span className="text-secondary text-xs">(read before die roll)</span>
                    </label>
                    <textarea
                      id="finale-setup"
                      className="input"
                      value={selectedScene.finale_setup_text || ''}
                      onChange={e => updateScene(selectedScene.id, { finale_setup_text: e.target.value })}
                      rows={3}
                      placeholder="Explain the final challenge and die roll mechanics..."
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>
                  <div style={{ marginBottom: 'var(--space-md)' }}>
                    <label htmlFor="victory-text" className="label">
                      Victory Text <span className="text-secondary text-xs">(read on successful roll)</span>
                    </label>
                    <textarea
                      ref={victoryTextRef}
                      id="victory-text"
                      className="input"
                      value={selectedScene.victory_text || ''}
                      onChange={e => updateScene(selectedScene.id, { victory_text: e.target.value })}
                      onFocus={() => activeFinaleTextarea.current = 'victory'}
                      rows={4}
                      placeholder="The triumphant ending..."
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="defeat-text" className="label">
                      Defeat Text <span className="text-secondary text-xs">(read on failed roll)</span>
                    </label>
                    <textarea
                      ref={defeatTextRef}
                      id="defeat-text"
                      className="input"
                      value={selectedScene.defeat_text || ''}
                      onChange={e => updateScene(selectedScene.id, { defeat_text: e.target.value })}
                      onFocus={() => activeFinaleTextarea.current = 'defeat'}
                      rows={4}
                      placeholder="The tragic ending..."
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>

                  {/* Item Text Blocks */}
                  <div style={{ marginTop: 'var(--space-lg)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--text-secondary)' }}>
                    <h5 style={{ marginBottom: 'var(--space-sm)' }}>
                      Item-Conditional Text
                      <span className="text-secondary text-xs" style={{ marginLeft: 'var(--space-sm)', fontWeight: 'normal' }}>
                        Use {'{item_text:ItemName}'} in victory/defeat text
                      </span>
                    </h5>
                    <p className="text-secondary text-xs" style={{ marginBottom: 'var(--space-md)' }}>
                      Add text snippets that only appear when specific items were collected.
                    </p>

                    {/* Existing item text blocks */}
                    {Object.entries(selectedScene.item_texts || {}).map(([itemName, itemEntry]) => (
                      <div key={itemName} className="card" style={{ marginBottom: 'var(--space-sm)', padding: 'var(--space-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                          <strong className="text-sm">{itemName}</strong>
                          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                            <label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                              <input
                                type="checkbox"
                                checked={itemPreviewAcquired[itemName] || false}
                                onChange={e => setItemPreviewAcquired(prev => ({ ...prev, [itemName]: e.target.checked }))}
                              />
                              Preview
                            </label>
                            <button
                              className="btn btn--secondary btn--sm"
                              onClick={() => {
                                const newItemTexts = { ...selectedScene.item_texts }
                                delete newItemTexts[itemName]
                                updateScene(selectedScene.id, { item_texts: newItemTexts })
                              }}
                              style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xs)' }}>
                          <div>
                            <label className="text-xs text-secondary">Victory</label>
                            <textarea
                              className="input"
                              value={itemEntry?.victory || ''}
                              onChange={e => updateScene(selectedScene.id, {
                                item_texts: {
                                  ...selectedScene.item_texts,
                                  [itemName]: { ...itemEntry, victory: e.target.value }
                                }
                              })}
                              rows={2}
                              placeholder="Text shown on victory..."
                              style={{ width: '100%', resize: 'vertical', fontSize: 'var(--text-sm)' }}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-secondary">Defeat</label>
                            <textarea
                              className="input"
                              value={itemEntry?.defeat || ''}
                              onChange={e => updateScene(selectedScene.id, {
                                item_texts: {
                                  ...selectedScene.item_texts,
                                  [itemName]: { ...itemEntry, defeat: e.target.value }
                                }
                              })}
                              rows={2}
                              placeholder="Text shown on defeat..."
                              style={{ width: '100%', resize: 'vertical', fontSize: 'var(--text-sm)' }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Add new item text block */}
                    {availableItems.filter(item => !selectedScene.item_texts?.[item]).length > 0 && (
                      <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                        <select
                          className="input"
                          style={{ flex: 1 }}
                          defaultValue=""
                          onChange={e => {
                            if (e.target.value) {
                              updateScene(selectedScene.id, {
                                item_texts: { ...(selectedScene.item_texts || {}), [e.target.value]: { victory: '', defeat: '' } }
                              })
                              e.target.value = ''
                            }
                          }}
                        >
                          <option value="">Add item text block...</option>
                          {availableItems
                            .filter(item => !selectedScene.item_texts?.[item])
                            .map(item => (
                              <option key={item} value={item}>{item}</option>
                            ))
                          }
                        </select>
                      </div>
                    )}

                    {availableItems.length === 0 && (
                      <p className="text-secondary text-xs">
                        No items defined in this story yet. Add item choices to scenes first.
                      </p>
                    )}

                    {/* Live Preview */}
                    {(selectedScene.victory_text || selectedScene.defeat_text) && Object.keys(selectedScene.item_texts || {}).length > 0 && (
                      <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--text-secondary)' }}>
                        <div className="text-xs text-secondary" style={{ marginBottom: 'var(--space-xs)' }}>Preview (toggle items above):</div>
                        <div className="text-sm">
                          <strong>Victory:</strong>{' '}
                          {(selectedScene.victory_text || '').replace(
                            /\{item_text:([\w\s_:'-]+)\}/g,
                            (_, itemName) => itemPreviewAcquired[itemName] ? (selectedScene.item_texts?.[itemName]?.victory || '') : ''
                          )}
                        </div>
                        <div className="text-sm" style={{ marginTop: 'var(--space-xs)' }}>
                          <strong>Defeat:</strong>{' '}
                          {(selectedScene.defeat_text || '').replace(
                            /\{item_text:([\w\s_:'-]+)\}/g,
                            (_, itemName) => itemPreviewAcquired[itemName] ? (selectedScene.item_texts?.[itemName]?.defeat || '') : ''
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Choices - only shown for non-finale scenes */}
              {!selectedScene.is_finale && (
                <div className="editor-section">
                  <h4>Choices</h4>
                  {selectedScene.choices.map((choice, i) => (
                    <Collapsible
                      key={i}
                      title={<span className={`choice-badge choice-badge--${choice.kind}`}>{choice.kind}</span>}
                      preview={choice.display_text || 'No display text yet...'}
                      defaultOpen={i === 0}
                    >
                      <div className="editor-choice-field">
                        <label className="label label--xs">
                          Display Text (shown to players)
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={choice.display_text}
                          onChange={e => updateChoice(selectedScene.id, i, { display_text: e.target.value })}
                          placeholder="Do you choose to..."
                        />
                      </div>
                      <div className="editor-choice-field">
                        <label className="label label--xs">
                          Result Text (read after choice)
                        </label>
                        <textarea
                          className="input"
                          value={choice.result_text}
                          onChange={e => updateChoice(selectedScene.id, i, { result_text: e.target.value })}
                          placeholder="What happens when this choice is made..."
                          rows={3}
                        />
                      </div>
                      {choice.kind === 'item' && (
                        <div className="editor-choice-field editor-choice-item-name">
                          <label className="label label--xs">
                            Item Name
                          </label>
                          <input
                            type="text"
                            className="input"
                            value={choice.item_name || ''}
                            onChange={e => updateChoice(selectedScene.id, i, { item_name: e.target.value })}
                          />
                        </div>
                      )}
                    </Collapsible>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state when nothing selected */}
          {!selectedScene && !editingOpeningScene && !editingCharacterCreation && (
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
    </div>
  )
}
