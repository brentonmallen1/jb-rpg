import type { ChoiceKind, Condition, ConditionType, Story } from '../../types'
import { CONDITION_TYPES, OP_WORDS, OUTCOME_WORDS, conditionOfType } from '../../lib/storyEdit'
import { Combobox } from './Combobox'
import { ItemPicker } from './pickers'

interface ConditionFieldsProps {
  story: Story
  condition: Condition
  /** The scene being edited, which a condition can't look back on */
  sceneId?: string
  onChange: (condition: Condition) => void
  update: (change: (story: Story) => Story) => void
  label: string
  /** The kinds of condition to offer (all of them unless given) */
  types?: ConditionType[]
}

/** One condition as a sentence: "[they hold an item] [Climbing Rope]", "[the hero's health] [is at most] [1]". */
export function ConditionFields({ story, condition: c, sceneId, onChange, update, label, types }: ConditionFieldsProps) {
  return (
    <span className="ed-condition">
      <select className="ed-inline-select" aria-label={`${label}: what to check`} value={c.type} onChange={e => onChange(conditionOfType(e.target.value as ConditionType))}>
        {CONDITION_TYPES.filter(t => !types || types.includes(t.value)).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
            {(Object.keys(OUTCOME_WORDS) as ChoiceKind[]).map(kind => <option key={kind} value={kind}>{OUTCOME_WORDS[kind]}</option>)}
          </select>
        </>
      ) : (
        <>
          <select className="ed-inline-select" aria-label={`${label}: comparison`} value={c.op ?? 'lte'} onChange={e => onChange({ ...c, op: e.target.value as Condition['op'] })}>
            {(Object.keys(OP_WORDS) as (keyof typeof OP_WORDS)[]).map(op => <option key={op} value={op}>is {OP_WORDS[op]}</option>)}
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
