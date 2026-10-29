import type { Choice, ChoiceKind, StoryProblem, ThemeName } from '../../types'
import { KIND_LABEL, newChoices } from '../../lib/storyEdit'
import { OUTCOME_ICON } from '../../lib/outcomes'
import { Field, TextArea, TextInput } from './fields'
import { ItemIconPicker } from './ItemIconPicker'

interface ChoiceCardsProps {
  choices: Choice[]
  problems: StoryProblem[]
  theme: ThemeName
  onChange: (choices: Choice[]) => void
}

const KINDS: ChoiceKind[] = ['damage', 'item', 'level']

/** The scene's choices: classically one that costs a life, one that finds an item, one that levels up. */
export function ChoiceCards({ choices, problems, theme, onChange }: ChoiceCardsProps) {
  const update = (i: number, patch: Partial<Choice>) => onChange(choices.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const kinds = choices.map(c => c.kind)
  const classic = choices.length === 3 && KINDS.every(k => kinds.includes(k))

  if (choices.length === 0) {
    return (
      <div className="ed-empty">
        <p>This scene has no choices yet.</p>
        <button type="button" className="s-btn" onClick={() => onChange(newChoices())}>Add the three choices</button>
      </div>
    )
  }

  return (
    <div className="ed-choices">
      {!classic && (
        <p className="ed-muted">
          Scenes usually have exactly three choices: one that costs a life, one that finds an item, one that levels up.
        </p>
      )}
      {choices.map((choice, i) => {
        const Icon = OUTCOME_ICON[choice.kind]
        const itemProblem = problems.find(p => p.field === 'item_name' && p.index === i)
        return (
          <article key={i} className={`ed-choice ed-choice--${choice.kind}`}>
            <header className="ed-choice__head">
              <span className={`ed-choice__kind outcome--${choice.kind}`}>
                <Icon size={16} /> {KIND_LABEL[choice.kind]}
              </span>
              <select
                className="ed-inline-select"
                aria-label={`Outcome of choice ${i + 1}`}
                value={choice.kind}
                onChange={e => {
                  const kind = e.target.value as ChoiceKind
                  update(i, { kind, item_name: kind === 'item' ? choice.item_name ?? '' : undefined, item_icon: kind === 'item' ? choice.item_icon : undefined })
                }}
              >
                {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </header>

            <Field label="What the players are asked" htmlFor={`choice-${i}-display`}>
              <TextInput
                id={`choice-${i}-display`}
                value={choice.display_text}
                onChange={e => update(i, { display_text: e.target.value })}
                placeholder="Do you…?"
              />
            </Field>

            {choice.kind === 'item' && (
              <Field label="The item they find" htmlFor={`choice-${i}-item`} error={itemProblem ? 'Name the item: it adds +1 to the final roll.' : null}>
                <TextInput
                  id={`choice-${i}-item`}
                  value={choice.item_name ?? ''}
                  onChange={e => update(i, { item_name: e.target.value })}
                  placeholder="Crimson Blade"
                />
              </Field>
            )}

            {choice.kind === 'item' && (
              <ItemIconPicker
                id={`choice-${i}-icon`}
                itemName={choice.item_name ?? ''}
                icon={choice.item_icon}
                theme={theme}
                onChange={item_icon => update(i, { item_icon })}
              />
            )}

            <Field label="What happens" hint="read aloud after the choice" htmlFor={`choice-${i}-result`}>
              <TextArea
                id={`choice-${i}-result`}
                value={choice.result_text}
                onChange={e => update(i, { result_text: e.target.value })}
                placeholder="You reach out and…"
              />
            </Field>
          </article>
        )
      })}
    </div>
  )
}
