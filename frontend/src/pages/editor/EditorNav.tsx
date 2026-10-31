import { useState } from 'react'
import type { Story, StoryProblem } from '../../types'
import { sceneBranches, sceneStatus, storyItems } from '../../lib/storyEdit'
import { BranchIcon } from '../../components/Icons'

export type EditorSelection =
  | { kind: 'story' }
  | { kind: 'characters' }
  | { kind: 'opening'; focus?: string }
  | { kind: 'items'; id?: string }
  | { kind: 'scene'; id: string; focus?: string }  // focus: a field in the panel to bring into view (its data-focus)

interface EditorNavProps {
  story: Story
  selection: EditorSelection
  problems: StoryProblem[]
  onSelect: (selection: EditorSelection) => void
  onAddScene: () => void
  onAddOpening: () => void
  onMoveScene: (sceneId: string, toIndex: number) => void
}

export function EditorNav({ story, selection, problems, onSelect, onAddScene, onAddOpening, onMoveScene }: EditorNavProps) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const is = (s: EditorSelection) =>
    s.kind === selection.kind && (s.kind !== 'scene' || (selection.kind === 'scene' && s.id === selection.id))
  const areaProblems = (area: StoryProblem['area']) => problems.filter(p => p.area === area).length

  return (
    <nav className="ed-nav" aria-label="Story sections">
      <button className={`ed-nav__item ${is({ kind: 'characters' }) ? 'is-active' : ''}`} onClick={() => onSelect({ kind: 'characters' })}>
        <span>Characters</span>
        <span className="ed-nav__meta">{areaProblems('characters') > 0 ? <span className="ed-dot ed-dot--problem" /> : `${story.madlib_template.fields.length} questions`}</span>
      </button>
      <button className={`ed-nav__item ${is({ kind: 'items' }) ? 'is-active' : ''}`} onClick={() => onSelect({ kind: 'items' })}>
        <span>Items</span>
        <span className="ed-nav__meta">{areaProblems('items') > 0 ? <span className="ed-dot ed-dot--problem" title="An item needs a look" /> : storyItems(story).length}</span>
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
                {sceneBranches(scene) && <BranchIcon size={14} className="ed-scene__branch" label="Branches" />}
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
