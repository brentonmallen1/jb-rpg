import type { ChoiceKind, Condition, ConditionType, Story } from '../../types'
import { Combobox } from './Combobox'
import { ItemPicker } from './pickers'

const TYPES: { value: ConditionType; label: string }[] = [
  { value: 'item_held', label: 'they hold an item' },
  { value: 'scene_outcome', label: 'an earlier scene went a way' },
  { value: 'hp', label: "the hero's health" },
  { value: 'level', label: "the hero's level" },
  { value: 'items', label: 'the number of items carried' },
]

const OPS = [
  { value: 'lte', label: 'is at most' },
  { value: 'gte', label: 'is at least' },
  { value: 'eq', label: 'is exactly' },
] as const

const OUTCOMES: { kind: ChoiceKind; label: string }[] = [
  { kind: 'damage', label: 'they lost a life' },
  { kind: 'item', label: 'they found an item' },
  { kind: 'level', label: 'they grew stronger' },
]

/** A fresh condition of a type, keeping nothing that doesn't belong to it. */
function ofType(type: ConditionType): Condition {
  if (type === 'item_held') return { type }
  if (type === 'scene_outcome') return { type, outcome: 'item' }
  return { type, op: type === 'hp' ? 'lte' : 'gte', value: 1 }
}

interface ConditionFieldsProps {
  story: Story
  condition: Condition
  /** The scene being edited, which a condition can't look back on */
  sceneId?: string
  onChange: (condition: Condition) => void
  update: (change: (story: Story) => Story) => void
  label: string
}

/** One condition as a sentence: "[they hold an item] [Climbing Rope]", "[the hero's health] [is at most] [1]". */
export function ConditionFields({ story, condition: c, sceneId, onChange, update, label }: ConditionFieldsProps) {
  return (
    <span className="ed-condition">
      <select className="ed-inline-select" aria-label={`${label}: what to check`} value={c.type} onChange={e => onChange(ofType(e.target.value as ConditionType))}>
        {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {c.type === 'item_held' ? (
        <ItemPicker story={story} value={c.item_id} onChange={item_id => onChange({ ...c, item_id })} update={update} aria-label={`${label}: the item`} />
      ) : c.type === 'scene_outcome' ? (
        <>
          <Combobox
            aria-label={`${label}: the scene`}
            value={c.scene_id}
            options={story.scenes.filter(s => s.id !== sceneId).map(s => ({ value: s.id, label: s.title || 'Untitled scene' }))}
            onChange={scene_id => onChange({ ...c, scene_id })}
            placeholder="Search scenes"
          />
          <select className="ed-inline-select" aria-label={`${label}: how it went`} value={c.outcome ?? 'item'} onChange={e => onChange({ ...c, outcome: e.target.value as ChoiceKind })}>
            {OUTCOMES.map(o => <option key={o.kind} value={o.kind}>{o.label}</option>)}
          </select>
        </>
      ) : (
        <>
          <select className="ed-inline-select" aria-label={`${label}: comparison`} value={c.op ?? 'lte'} onChange={e => onChange({ ...c, op: e.target.value as Condition['op'] })}>
            {OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            className="ed-inline-number"
            type="number"
            min={0}
            aria-label={`${label}: number`}
            value={c.value ?? ''}
            onChange={e => onChange({ ...c, value: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </>
      )}
    </span>
  )
}
