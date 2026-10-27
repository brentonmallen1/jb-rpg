import { useState } from 'react'
import type { Scene, Story, StoryProblem } from '../../types'

export type EditorSelection =
  | { kind: 'story' }
  | { kind: 'characters' }
  | { kind: 'opening' }
  | { kind: 'scene'; id: string }

interface EditorNavProps {
  story: Story
  selection: EditorSelection
  problems: StoryProblem[]
  onSelect: (selection: EditorSelection) => void
  onAddScene: () => void
  onAddOpening: () => void
  onMoveScene: (sceneId: string, toIndex: number) => void
}

/** Is a scene written enough to play? (Problems come from the server; this adds "unwritten".) */
function sceneStatus(scene: Scene, problems: StoryProblem[]): { tone: 'problem' | 'draft' | 'ready'; label: string } {
  if (problems.some(p => p.scene_id === scene.id)) return { tone: 'problem', label: 'Needs fixing before play' }
  const unwritten = !scene.base_text.trim() ||
    (scene.is_finale ? !scene.victory_text?.trim() || !scene.defeat_text?.trim()
      : scene.choices.some(c => !c.display_text.trim() || !c.result_text.trim()))
  return unwritten ? { tone: 'draft', label: 'Still being written' } : { tone: 'ready', label: 'Written' }
}

export function EditorNav({ story, selection, problems, onSelect, onAddScene, onAddOpening, onMoveScene }: EditorNavProps) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const is = (s: EditorSelection) =>
    s.kind === selection.kind && (s.kind !== 'scene' || (selection.kind === 'scene' && s.id === selection.id))
  const areaProblems = (area: StoryProblem['area']) => problems.filter(p => p.area === area).length

  return (
    <nav className="ed-nav" aria-label="Story sections">
      <button className={`ed-nav__item ${is({ kind: 'story' }) ? 'is-active' : ''}`} onClick={() => onSelect({ kind: 'story' })}>
        <span>Story</span>
        {problems.length > 0 && <span className="ed-badge" title={`${problems.length} to fix before playing`}>{problems.length}</span>}
      </button>
      <button className={`ed-nav__item ${is({ kind: 'characters' }) ? 'is-active' : ''}`} onClick={() => onSelect({ kind: 'characters' })}>
        <span>Characters</span>
        <span className="ed-nav__meta">{areaProblems('characters') > 0 ? <span className="ed-dot ed-dot--problem" /> : `${story.madlib_template.fields.length} questions`}</span>
      </button>
      {story.opening_scene ? (
        <button className={`ed-nav__item ${is({ kind: 'opening' }) ? 'is-active' : ''}`} onClick={() => onSelect({ kind: 'opening' })}>
          <span>Prologue</span>
          {areaProblems('opening') > 0 && <span className="ed-dot ed-dot--problem" />}
        </button>
      ) : (
        <button className="ed-nav__item ed-nav__item--add" onClick={onAddOpening}>+ Add a prologue</button>
      )}

      <div className="ed-nav__heading">
        <span className="stage-label">Scenes</span>
        <button className="s-btn s-btn--ghost ed-nav__add" onClick={onAddScene}>+ Add</button>
      </div>

      <ol
        className="ed-scenes"
        onDragOver={e => e.preventDefault()}
        onDrop={() => {
          if (dragging !== null && dropIndex !== null) {
            const from = story.scenes.findIndex(s => s.id === dragging)
            onMoveScene(dragging, dropIndex > from ? dropIndex - 1 : dropIndex)
          }
          setDragging(null)
          setDropIndex(null)
        }}
      >
        {story.scenes.map((scene, i) => {
          const status = sceneStatus(scene, problems)
          return (
            <li
              key={scene.id}
              className={`ed-scene ${dragging === scene.id ? 'is-dragging' : ''} ${dropIndex === i ? 'is-drop-before' : ''} ${dropIndex === i + 1 && i === story.scenes.length - 1 ? 'is-drop-after' : ''}`}
              draggable
              onDragStart={e => {
                setDragging(scene.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                setDragging(null)
                setDropIndex(null)
              }}
              onDragOver={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                setDropIndex(e.clientY < rect.top + rect.height / 2 ? i : i + 1)
              }}
            >
              <button
                className={`ed-nav__item ${is({ kind: 'scene', id: scene.id }) ? 'is-active' : ''}`}
                onClick={() => onSelect({ kind: 'scene', id: scene.id })}
              >
                <span className={`ed-dot ed-dot--${status.tone}`} title={status.label} aria-label={status.label} />
                <span className="ed-scene__title">{i + 1}. {scene.title || 'Untitled'}</span>
                {scene.is_finale && <span className="ed-nav__meta">finale</span>}
              </button>
              <span className="ed-scene__move">
                <button onClick={() => onMoveScene(scene.id, i - 1)} disabled={i === 0} aria-label={`Move ${scene.title} up`}>▲</button>
                <button onClick={() => onMoveScene(scene.id, i + 1)} disabled={i === story.scenes.length - 1} aria-label={`Move ${scene.title} down`}>▼</button>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
