import type { Choice, ChoiceKind, Scene, Story, StoryProblem } from '../../types'
import { KIND_LABEL, afterSceneTitle, findItem, newChoices, patchScene } from '../../lib/storyEdit'
import { OUTCOME_ICON } from '../../lib/outcomes'
import { Field, TextArea, TextInput } from './fields'
import { ItemPicker, TargetPicker } from './pickers'

interface ChoiceCardsProps {
  story: Story
  scene: Scene
  problems: StoryProblem[]
  update: (change: (story: Story) => Story) => void
  /** Open an item in the Items section (its icon and description live there) */
  onOpenItem: (itemId: string) => void
  /** Write a choice's result in the larger window */
  onWrite: (index: number) => void
}

const KINDS: ChoiceKind[] = ['damage', 'item', 'level']

/** The scene's choices: classically one that costs a life, one that finds an item, one that levels up. */
export function ChoiceCards({ story, scene, problems, update, onOpenItem, onWrite }: ChoiceCardsProps) {
  const choices = scene.choices
  const onChange = (next: Choice[]) => update(s => patchScene(s, scene.id, { choices: next }))
  const change = (i: number, patch: Partial<Choice>) => update(s => patchScene(s, scene.id, sc => ({
    ...sc, choices: sc.choices.map((c, j) => (j === i ? { ...c, ...patch } : c)),
  })))
  const kinds = choices.map(c => c.kind)
  const classic = choices.length === 3 && KINDS.every(k => kinds.includes(k))
  const afterScene = scene.routes?.length ? 'After this scene (its routes, below)' : `After this scene: ${afterSceneTitle(story, scene)}`

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
        const itemProblem = problems.find(p => p.field === 'item_id' && p.index === i)
        const linkProblem = problems.find(p => p.field === 'next_scene_id' && p.index === i)
        const item = findItem(story, choice.item_id)
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
                  change(i, { kind, item_id: kind === 'item' ? choice.item_id : null })
                }}
              >
                {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </header>

            <Field label="What the players are asked" htmlFor={`choice-${i}-display`}>
              <TextInput
                id={`choice-${i}-display`}
                value={choice.display_text}
                onChange={e => change(i, { display_text: e.target.value })}
                placeholder="Do you…?"
              />
            </Field>

            {choice.kind === 'item' && (
              <Field
                label="The item they find"
                htmlFor={`choice-${i}-item`}
                error={itemProblem ? 'Choose the item: it adds +1 to the final roll.' : null}
              >
                <ItemPicker
                  id={`choice-${i}-item`}
                  story={story}
                  value={choice.item_id}
                  invalid={!!itemProblem}
                  onChange={item_id => change(i, { item_id })}
                  update={update}
                />
                {item && (
                  <button type="button" className="ed-link" onClick={() => onOpenItem(item.id)}>
                    {item.description ? 'Its icon and description' : 'Give it an icon and a description'} →
                  </button>
                )}
              </Field>
            )}

            <Field label="What happens" hint="read aloud after the choice" htmlFor={`choice-${i}-result`}>
              <TextArea
                id={`choice-${i}-result`}
                value={choice.result_text}
                onChange={e => change(i, { result_text: e.target.value })}
                placeholder="You reach out and…"
                onExpand={() => onWrite(i)}
              />
            </Field>

            <Field label="Leads to" htmlFor={`choice-${i}-next`} error={linkProblem?.message ?? null}>
              <TargetPicker
                id={`choice-${i}-next`}
                story={story}
                scene={scene}
                value={choice.next_scene_id}
                defaultLabel={afterScene}
                invalid={!!linkProblem}
                onChange={next_scene_id => change(i, { next_scene_id })}
                update={update}
              />
            </Field>
          </article>
        )
      })}
    </div>
  )
}
