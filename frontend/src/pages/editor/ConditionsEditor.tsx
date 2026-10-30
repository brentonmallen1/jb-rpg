import { useState } from 'react'
import type { ChoiceKind, ConditionalText, ConditionType, Story, StoryProblem } from '../../types'
import { newCondition } from '../../lib/storyEdit'
import { OUTCOME_ICON } from '../../lib/outcomes'
import { CloseIcon } from '../../components/Icons'
import { TextArea } from './fields'
import { Combobox } from './Combobox'
import { ConditionFields } from './ConditionFields'

interface ConditionsEditorProps {
  conditions: ConditionalText[]
  story: Story
  update: (change: (story: Story) => Story) => void
  /** The scene being edited (it can't depend on its own outcome) */
  currentSceneId?: string
  problems: StoryProblem[]
  onChange: (conditions: ConditionalText[]) => void
  /** Write a line in the larger window */
  onWrite?: (index: number) => void
}

// Lines after an earlier scene are grouped by scene below; the rest are one sentence each
const HERO_TYPES: ConditionType[] = ['item_held', 'hp', 'level', 'items']

const OUTCOMES: { kind: ChoiceKind; label: string }[] = [
  { kind: 'damage', label: 'If the hero lost a life' },
  { kind: 'item', label: 'If the hero found an item' },
  { kind: 'level', label: 'If the hero grew stronger' },
]

type Indexed = { ct: ConditionalText; index: number }

/**
 * Text that's added only in some games. Lines that depend on an earlier scene are grouped by
 * that scene, one slot per outcome (an empty slot adds nothing); health, items and level
 * conditions read as sentences.
 */
export function ConditionsEditor({ conditions, story, update, currentSceneId, problems, onChange, onWrite }: ConditionsEditorProps) {
  const scenes = story.scenes
  const [open, setOpen] = useState<Set<string>>(new Set())
  // Scenes picked from "Add text for after…" that have no text yet
  const [added, setAdded] = useState<string[]>([])

  const indexed: Indexed[] = conditions.map((ct, index) => ({ ct, index }))
  const afterScene = indexed.filter(({ ct }) => ct.condition.type === 'scene_outcome')
  const byStat = indexed.filter(({ ct }) => ct.condition.type !== 'scene_outcome')
  const problemAt = (index: number) => problems.find(p => p.field === 'conditional_text' && p.index === index)

  // One group per scene, in story order; unknown scene ids (deleted scenes) last
  const usedIds = [...new Set([...afterScene.map(({ ct }) => ct.condition.scene_id ?? ''), ...added])]
  const groupIds = [
    ...scenes.filter(s => usedIds.includes(s.id)).map(s => s.id),
    ...usedIds.filter(id => !scenes.some(s => s.id === id)),
  ]
  const addable = scenes.filter(s => s.id !== currentSceneId && !groupIds.includes(s.id))

  const replace = (index: number, next: ConditionalText) => onChange(conditions.map((c, j) => (j === index ? next : c)))
  const remove = (index: number) => onChange(conditions.filter((_, j) => j !== index))

  function setOutcomeText(sceneId: string, kind: ChoiceKind, entry: Indexed | null, text: string) {
    if (entry && !text) return remove(entry.index)  // an empty slot adds nothing
    if (entry) return replace(entry.index, { ...entry.ct, text })
    if (text) onChange([...conditions, { condition: { type: 'scene_outcome', scene_id: sceneId, outcome: kind }, text }])
  }

  function removeGroup(sceneId: string) {
    onChange(conditions.filter(c => !(c.condition.type === 'scene_outcome' && (c.condition.scene_id ?? '') === sceneId)))
    setAdded(a => a.filter(id => id !== sceneId))
  }

  function toggle(sceneId: string) {
    setOpen(o => {
      const next = new Set(o)
      if (next.has(sceneId)) next.delete(sceneId)
      else next.add(sceneId)
      return next
    })
  }

  const empty = conditions.length === 0 && added.length === 0

  return (
    <div className="cx">
      {empty && (
        <p className="ed-muted cx__intro">
          Lines that only appear in some games: after an earlier scene, depending on how it went,
          when the hero holds a particular item, or when their health, items or level reach a number. They’re added after the scene’s text.
        </p>
      )}

      {groupIds.length > 0 && (
        <div className="cx__block">
          <h4 className="cx__heading">After an earlier scene</h4>
          {groupIds.map(sceneId => {
            const scene = scenes.find(s => s.id === sceneId)
            const entries = afterScene.filter(({ ct }) => (ct.condition.scene_id ?? '') === sceneId)
            const groupProblem = entries.some(e => problemAt(e.index))
            const isOpen = open.has(sceneId) || groupProblem || (added.includes(sceneId) && entries.length === 0)
            const written = OUTCOMES.filter(o => entries.some(({ ct }) => ct.condition.outcome === o.kind && ct.text.trim()))
            return (
              <section key={sceneId || 'none'} className={`cx-group ${isOpen ? 'is-open' : ''} ${groupProblem ? 'has-problem' : ''}`}>
                <div className="cx-group__head">
                  <button type="button" className="cx-group__toggle" aria-expanded={isOpen} onClick={() => toggle(sceneId)}>
                    <span className="cx-group__chevron" aria-hidden="true">›</span>
                    <span className="cx-group__title">
                      {scene ? scene.title || 'Untitled scene' : sceneId ? 'A scene that no longer exists' : 'No scene chosen'}
                    </span>
                    <span className="cx-group__pips" aria-label={`${written.length} of 3 outcomes have text`}>
                      {OUTCOMES.map(o => {
                        const Icon = OUTCOME_ICON[o.kind]
                        const has = written.includes(o)
                        return <Icon key={o.kind} size={15} className={has ? `outcome--${o.kind}` : 'cx-pip--empty'} />
                      })}
                    </span>
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Remove all text for after ${scene?.title ?? 'this scene'}`} onClick={() => removeGroup(sceneId)}>
                    <CloseIcon size={16} />
                  </button>
                </div>

                {isOpen && (
                  <div className="cx-group__body">
                    {OUTCOMES.map(o => {
                      const Icon = OUTCOME_ICON[o.kind]
                      const matches = entries.filter(({ ct }) => ct.condition.outcome === o.kind)
                      const slots: (Indexed | null)[] = matches.length ? matches : [null]
                      return slots.map((entry, k) => {
                        const problem = entry && problemAt(entry.index)
                        return (
                          <div key={`${o.kind}-${k}`} className="cx-slot">
                            <span className={`cx-slot__label outcome--${o.kind}`}>
                              <Icon size={15} /> {o.label}
                            </span>
                            <TextArea
                              rows={2}
                              aria-label={`${o.label} in ${scene?.title ?? 'that scene'}`}
                              value={entry?.ct.text ?? ''}
                              placeholder="Nothing extra."
                              onChange={e => setOutcomeText(sceneId, o.kind, entry, e.target.value)}
                              onExpand={entry && onWrite ? () => onWrite(entry.index) : undefined}
                            />
                            {problem && <p className="ed-error" role="alert">{problem.message}</p>}
                          </div>
                        )
                      })
                    })}
                    <p className="cx__note">Nothing is added in games where this scene hasn’t been played yet.</p>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {byStat.length > 0 && (
        <div className="cx__block">
          <h4 className="cx__heading">Depending on the hero</h4>
          {byStat.map(entry => {
            const c = entry.ct.condition
            const problem = problemAt(entry.index)
            return (
              <section key={entry.index} className={`cx-group is-open ${problem ? 'has-problem' : ''}`} data-focus={`line-${entry.index}`}>
                <div className="cx-group__head cx-sentence">
                  <span>When</span>
                  <ConditionFields
                    story={story}
                    sceneId={currentSceneId}
                    condition={c}
                    types={HERO_TYPES}
                    label="This line"
                    onChange={condition => replace(entry.index, { ...entry.ct, condition })}
                    update={update}
                  />
                  <span className="cx-sentence__tail">, add:</span>
                  <button type="button" className="icon-btn cx-sentence__remove" aria-label="Remove this line" onClick={() => remove(entry.index)}>
                    <CloseIcon size={16} />
                  </button>
                </div>
                <div className="cx-group__body">
                  <TextArea
                    rows={2}
                    aria-label="Text to add"
                    value={entry.ct.text}
                    onChange={e => replace(entry.index, { ...entry.ct, text: e.target.value })}
                    placeholder="Added after the scene’s text when this is true…"
                    onExpand={onWrite ? () => onWrite(entry.index) : undefined}
                  />
                  {problem && <p className="ed-error" role="alert">{problem.message}</p>}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <div className="cx__add">
        {addable.length > 0 && (
          <Combobox
            className="cx__add-scene"
            aria-label="Add text for after a scene"
            value=""
            options={addable.map(s => ({ value: s.id, label: s.title || 'Untitled scene' }))}
            onChange={id => {
              setAdded(a => [...a, id])
              setOpen(o => new Set(o).add(id))
            }}
            placeholder="+ After a scene…"
          />
        )}
        <button type="button" className="s-btn s-btn--ghost" onClick={() => onChange([...conditions, newCondition()])}>
          + Depending on the hero, or what they carry
        </button>
      </div>
    </div>
  )
}
