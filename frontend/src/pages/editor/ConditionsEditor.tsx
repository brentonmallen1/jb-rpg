import type { Condition, ConditionalText, Scene, StoryProblem } from '../../types'
import { newCondition } from '../../lib/storyEdit'
import { CloseIcon } from '../../components/Icons'
import { TextArea } from './fields'

interface ConditionsEditorProps {
  conditions: ConditionalText[]
  scenes: Scene[]
  /** The scene being edited (it can't depend on its own outcome) */
  currentSceneId?: string
  problems: StoryProblem[]
  onChange: (conditions: ConditionalText[]) => void
}

const SUBJECTS = [
  { value: 'hp', label: "the party's health" },
  { value: 'items', label: 'the number of items' },
  { value: 'level', label: "the party's level" },
  { value: 'scene_outcome', label: 'how an earlier scene went' },
] as const

const OPS = [
  { value: 'lte', label: 'is at most' },
  { value: 'gte', label: 'is at least' },
  { value: 'eq', label: 'is exactly' },
] as const

const OUTCOMES = [
  { value: 'damage', label: 'cost a life' },
  { value: 'item', label: 'found an item' },
  { value: 'level', label: 'grew stronger' },
] as const

/** Extra text that's added only when a condition holds, written as sentences. */
export function ConditionsEditor({ conditions, scenes, currentSceneId, problems, onChange }: ConditionsEditorProps) {
  const replace = (i: number, next: ConditionalText) => onChange(conditions.map((c, j) => (j === i ? next : c)))
  const setCondition = (i: number, patch: Partial<Condition>) =>
    replace(i, { ...conditions[i], condition: { ...conditions[i].condition, ...patch } })
  const otherScenes = scenes.filter(s => s.id !== currentSceneId)

  return (
    <div className="ed-conditions">
      {conditions.length === 0 && (
        <p className="ed-muted">
          Add text that only appears in some games: when health is low, when the party carries items,
          or depending on how an earlier scene went.
        </p>
      )}

      {conditions.map((ct, i) => {
        const c = ct.condition
        const problem = problems.find(p => p.field === 'conditional_text' && p.index === i)
        return (
          <div key={i} className={`ed-condition ${problem ? 'ed-condition--error' : ''}`}>
            <div className="ed-sentence">
              <span>If</span>
              <select
                className="ed-inline-select"
                aria-label="Condition"
                value={c.type}
                onChange={e => {
                  const type = e.target.value as Condition['type']
                  setCondition(i, type === 'scene_outcome'
                    ? { type, op: undefined, value: undefined, scene_id: otherScenes[0]?.id, outcome: 'item' }
                    : { type, op: c.op ?? 'lte', value: c.value ?? 1, scene_id: undefined, outcome: undefined })
                }}
              >
                {SUBJECTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              {c.type === 'scene_outcome' ? (
                <>
                  <span>in</span>
                  <select
                    className="ed-inline-select"
                    aria-label="Scene"
                    value={c.scene_id ?? ''}
                    onChange={e => setCondition(i, { scene_id: e.target.value || undefined })}
                  >
                    <option value="">choose a scene…</option>
                    {otherScenes.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <span>was that the party</span>
                  <select
                    className="ed-inline-select"
                    aria-label="Outcome"
                    value={c.outcome ?? 'item'}
                    onChange={e => setCondition(i, { outcome: e.target.value as Condition['outcome'] })}
                  >
                    {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <select
                    className="ed-inline-select"
                    aria-label="Comparison"
                    value={c.op ?? 'lte'}
                    onChange={e => setCondition(i, { op: e.target.value as Condition['op'] })}
                  >
                    {OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input
                    className="ed-inline-number"
                    type="number"
                    min={0}
                    aria-label="Number"
                    value={c.value ?? ''}
                    onChange={e => setCondition(i, { value: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </>
              )}
              <span>, add:</span>
              <button
                type="button"
                className="icon-btn ed-condition__remove"
                aria-label="Remove this condition"
                onClick={() => onChange(conditions.filter((_, j) => j !== i))}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <TextArea
              aria-label="Text to add"
              value={ct.text}
              onChange={e => replace(i, { ...ct, text: e.target.value })}
              placeholder="This text is appended to the scene when the condition holds…"
            />
            {problem && <p className="ed-error" role="alert">{problem.message}</p>}
          </div>
        )
      })}

      <button type="button" className="s-btn s-btn--ghost" onClick={() => onChange([...conditions, newCondition()])}>
        + Add conditional text
      </button>
    </div>
  )
}
