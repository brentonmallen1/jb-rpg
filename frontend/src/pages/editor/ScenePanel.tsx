import { useState, type RefObject } from 'react'
import type { AudioFile, Condition, Route, Scene, Story, StoryProblem } from '../../types'
import { MOODS } from '../../lib/themes'
import { KIND_LABEL, defaultNextTitle, describeCondition, findItem, isDoor, newChoices, patchScene, storyItems } from '../../lib/storyEdit'
import { CloseIcon } from '../../components/Icons'
import { Field, Section, TextArea, TextInput } from './fields'
import { KeyChips } from './KeyChips'
import { ChoiceCards } from './ChoiceCards'
import { ConditionsEditor } from './ConditionsEditor'
import { ConditionFields } from './ConditionFields'
import { TargetPicker } from './pickers'
import { WritingDialog, type WritingEntry } from './WritingDialog'
import { FinaleSuggestions } from './FinaleSuggestions'

interface ScenePanelProps {
  story: Story
  scene: Scene
  problems: StoryProblem[]
  update: (change: (story: Story) => Story) => void
  textTarget: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  audio: AudioFile[]
  onDelete: () => void
  onOpenItem: (itemId: string) => void
}

// Problems shown next to their own field rather than at the top of the panel
const INLINE_FIELDS = ['item_id', 'conditional_text', 'next_scene_id', 'routes', 'next', 'requires']

export function ScenePanel({ story, scene, problems, update, textTarget, audio, onDelete, onOpenItem }: ScenePanelProps) {
  const patch = (p: Partial<Scene>) => update(s => patchScene(s, scene.id, p))
  const keyTokens = story.madlib_template.fields.map(f => ({ token: `{${f.key}}`, title: f.label || f.key }))
  const sceneProblems = problems.filter(p => p.scene_id === scene.id)
  const general = sceneProblems.filter(p => !INLINE_FIELDS.includes(p.field ?? '') || (p.field === 'next' && p.message.includes('loop')))
  const number = story.scenes.findIndex(s => s.id === scene.id) + 1
  const [writing, setWriting] = useState<string | null>(null)
  const entries = writingEntries(story, scene, patch)

  return (
    <div className="ed-panel">
      <div className="ed-panel__head">
        <span className="stage-label">Scene {number} of {story.scenes.length}{scene.is_finale && ' · finale'}</span>
        <button type="button" className="icon-btn" onClick={onDelete} disabled={story.scenes.length <= 1} aria-label="Delete this scene" title="Delete this scene">
          <CloseIcon />
        </button>
      </div>
      <input
        className="ed-title-input"
        aria-label="Scene title"
        value={scene.title}
        onChange={e => patch({ title: e.target.value })}
        placeholder="The Skeleton Room"
      />

      {general.length > 0 && (
        <ul className="ed-problems" role="status">
          {general.map(p => <li key={p.message} className={p.severity === 'warning' ? 'is-warning' : ''}>{p.message}</li>)}
        </ul>
      )}

      <KeyChips label="Insert a character detail" tokens={keyTokens} target={textTarget} />

      <div className="ed-grid-2">
        <Field label="Door name" hint={story.settings.non_linear ? 'shown when choosing the next scene' : 'shown above the title'} htmlFor="scene-door">
          <TextInput
            id="scene-door"
            value={scene.display_name ?? ''}
            onChange={e => patch({ display_name: e.target.value || undefined })}
            placeholder="The door marked with scratched tally marks"
          />
        </Field>
        <Field label="Backdrop" hint="the atmosphere on every screen" htmlFor="scene-mood">
          <select id="scene-mood" className="ed-input" value={scene.mood ?? ''} onChange={e => patch({ mood: e.target.value || null })}>
            <option value="">Automatic</option>
            {MOODS[story.theme].map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
      </div>

      {audio.length > 0 && (
        <Field label="Ambience" hint="what plays on the storyteller's screen during this scene" htmlFor="scene-ambience">
          <select id="scene-ambience" className="ed-input" value={scene.ambience ?? ''} onChange={e => patch({ ambience: e.target.value || null })}>
            <option value="">Story default{story.sound?.ambience ? ` (${story.sound.ambience})` : ' (silence)'}</option>
            <option value="none">Silence</option>
            {audio.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
        </Field>
      )}

      <Field label="The scene" hint="read aloud to the table" htmlFor="scene-text">
        <TextArea
          id="scene-text"
          className="ed-textarea--reading"
          value={scene.base_text}
          onChange={e => patch({ base_text: e.target.value })}
          placeholder="Dust. Silence. A room that feels like it's been holding its breath for centuries…"
          rows={6}
          onExpand={() => setWriting('scene-text')}
        />
      </Field>

      <label className="ed-toggle">
        <input
          type="checkbox"
          checked={!!scene.is_finale}
          onChange={e => patch(e.target.checked
            ? { is_finale: true, choices: [] }
            : { is_finale: false, choices: scene.choices.length ? scene.choices : newChoices() })}
        />
        <span>
          <strong>This is the finale</strong>
          <span className="ed-muted"> · no choices; the table rolls the d20</span>
        </span>
      </label>

      {scene.is_finale ? (
        <FinaleSection story={story} scene={scene} patch={patch} textTarget={textTarget} onWrite={setWriting} />
      ) : (
        <>
          <Section title="Choices">
            <ChoiceCards story={story} scene={scene} problems={sceneProblems} update={update} onOpenItem={onOpenItem} onWrite={i => setWriting(`choice-${i}`)} />
          </Section>
          <AfterThisScene story={story} scene={scene} problems={sceneProblems} update={update} />
        </>
      )}

      {story.settings.non_linear && isDoor(story, scene) && (
        <LockedUntil story={story} scene={scene} problems={sceneProblems} update={update} />
      )}

      <Section title="Text that changes">
        <ConditionsEditor
          conditions={scene.conditional_text}
          story={story}
          update={update}
          currentSceneId={scene.id}
          problems={sceneProblems}
          onChange={conditional_text => patch({ conditional_text })}
          onWrite={i => setWriting(`line-${i}`)}
        />
      </Section>

      <FinaleSuggestions story={story} on={!!scene.is_finale}>
        <WritingDialog title={scene.title || 'Untitled scene'} entries={entries} openId={writing} onClose={() => setWriting(null)} />
      </FinaleSuggestions>
    </div>
  )
}

/** Every long text in the scene, for the writing window, in the order the table hears them. */
function writingEntries(story: Story, scene: Scene, patch: (p: Partial<Scene>) => void): WritingEntry[] {
  const entries: WritingEntry[] = [
    { id: 'scene-text', group: 'Read aloud', label: 'Scene text', sub: 'when the scene opens', value: scene.base_text, onChange: base_text => patch({ base_text }) },
    ...scene.conditional_text.map((ct, i) => ({
      id: `line-${i}`,
      group: 'Read aloud',
      label: `If ${describeCondition(story, ct.condition)}`,
      sub: 'added after the scene text',
      value: ct.text,
      onChange: (text: string) => patch({ conditional_text: scene.conditional_text.map((c, j) => (j === i ? { ...c, text } : c)) }),
    })),
    ...scene.choices.map((c, i) => ({
      id: `choice-${i}`,
      group: 'After a choice',
      label: c.display_text || `Choice ${i + 1}`,
      sub: c.kind === 'item' ? `Finds ${findItem(story, c.item_id)?.name ?? 'an item'}` : KIND_LABEL[c.kind],
      value: c.result_text,
      onChange: (result_text: string) => patch({ choices: scene.choices.map((x, j) => (j === i ? { ...x, result_text } : x)) }),
    })),
  ]
  if (scene.is_finale) {
    entries.push(
      { id: 'finale-setup', group: 'The final roll', label: 'Before the roll', sub: 'sets up the last challenge', value: scene.finale_setup_text ?? '', onChange: finale_setup_text => patch({ finale_setup_text }) },
      { id: 'finale-victory', group: 'The final roll', label: 'Victory', sub: 'read on a roll of 20+', value: scene.victory_text ?? '', onChange: victory_text => patch({ victory_text }) },
      { id: 'finale-defeat', group: 'The final roll', label: 'Defeat', sub: 'read when every attempt falls short', value: scene.defeat_text ?? '', onChange: defeat_text => patch({ defeat_text }) },
    )
  }
  return entries
}

interface FinaleSectionProps {
  story: Story
  scene: Scene
  patch: (p: Partial<Scene>) => void
  textTarget: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onWrite: (entryId: string) => void
}

function FinaleSection({ story, scene, patch, textTarget, onWrite }: FinaleSectionProps) {
  const items = storyItems(story).filter(item => item.name.trim())
  const itemTexts = scene.item_texts ?? {}
  const unused = items.filter(item => !itemTexts[item.id])

  return (
    <FinaleSuggestions story={story} on>
      <Section title="The final roll">
        <Field label="Before the roll" hint="sets up the last challenge" htmlFor="finale-setup">
          <TextArea id="finale-setup" value={scene.finale_setup_text ?? ''} onChange={e => patch({ finale_setup_text: e.target.value })} placeholder="The ghost looms before you…" onExpand={() => onWrite('finale-setup')} />
        </Field>

        <KeyChips
          label="Insert an item's text"
          tokens={items.map(item => ({ token: `{item_text:${item.name}}`, text: item.name, title: `Only appears if the party found ${item.name}` }))}
          target={textTarget}
        />

        <div className="ed-grid-2">
          <Field label="Victory" hint="read on a roll of 20+" htmlFor="finale-victory">
            <TextArea id="finale-victory" value={scene.victory_text ?? ''} onChange={e => patch({ victory_text: e.target.value })} rows={5} placeholder="The triumphant ending…" onExpand={() => onWrite('finale-victory')} />
          </Field>
          <Field label="Defeat" hint="read when every attempt falls short" htmlFor="finale-defeat">
            <TextArea id="finale-defeat" value={scene.defeat_text ?? ''} onChange={e => patch({ defeat_text: e.target.value })} rows={5} placeholder="The tragic ending…" onExpand={() => onWrite('finale-defeat')} />
          </Field>
        </div>

        <div className="ed-subsection">
          <span className="ed-label">Item endings</span>
          <p className="ed-muted">Extra lines that appear where you insert an item's text, only if the party found that item.</p>
          {Object.entries(itemTexts).map(([id, texts]) => {
            const name = findItem(story, id)?.name || 'An item that no longer exists'
            return (
              <div key={id} className="ed-item-ending">
                <div className="ed-item-ending__head">
                  <strong>{name}</strong>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove ${name} endings`}
                    onClick={() => {
                      const next = { ...itemTexts }
                      delete next[id]
                      patch({ item_texts: next })
                    }}
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>
                <div className="ed-grid-2">
                  <TextArea aria-label={`${name} on victory`} value={texts.victory ?? ''} placeholder="On victory…" rows={2}
                    onChange={e => patch({ item_texts: { ...itemTexts, [id]: { ...texts, victory: e.target.value } } })} />
                  <TextArea aria-label={`${name} on defeat`} value={texts.defeat ?? ''} placeholder="On defeat…" rows={2}
                    onChange={e => patch({ item_texts: { ...itemTexts, [id]: { ...texts, defeat: e.target.value } } })} />
                </div>
              </div>
            )
          })}
          {items.length === 0 ? (
            <p className="ed-muted">No items in this story yet: add some under Items, or from a choice that finds one.</p>
          ) : unused.length > 0 && (
            <select
              className="ed-input"
              aria-label="Add item endings"
              value=""
              onChange={e => e.target.value && patch({ item_texts: { ...itemTexts, [e.target.value]: { victory: '', defeat: '' } } })}
            >
              <option value="">+ Add endings for an item…</option>
              {unused.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
        </div>
      </Section>
    </FinaleSuggestions>
  )
}

interface PathSectionProps {
  story: Story
  scene: Scene
  problems: StoryProblem[]
  update: (change: (story: Story) => Story) => void
}

/** Where the story goes after a choice that doesn't say: routes in order, then "otherwise". */
function AfterThisScene({ story, scene, problems, update }: PathSectionProps) {
  const routes = scene.routes ?? []
  const setRoutes = (next: Route[]) => update(s => patchScene(s, scene.id, { routes: next }))
  const setRoute = (i: number, route: Route) => setRoutes(routes.map((r, j) => (j === i ? route : r)))
  const nextProblem = problems.find(p => p.field === 'next' && !p.message.includes('loop'))

  return (
    <Section title="After this scene">
      <p className="ed-muted">
        Where the story goes once a choice is made, unless the choice leads somewhere itself.
        {routes.length > 1 && ' Routes are checked in order; the first that holds wins.'}
      </p>
      <div className="ed-routes">
        {routes.map((route, i) => {
          const problem = problems.find(p => p.field === 'routes' && p.index === i)
          return (
            <div key={i} className={`ed-route ${problem ? 'has-problem' : ''}`}>
              <div className="ed-route__row">
                <span className="ed-route__word">If</span>
                <ConditionFields
                  story={story}
                  sceneId={scene.id}
                  condition={route.condition}
                  label={`Route ${i + 1}`}
                  onChange={condition => setRoute(i, { ...route, condition })}
                  update={update}
                />
              </div>
              <div className="ed-route__row">
                <span className="ed-route__word">go to</span>
                <TargetPicker
                  story={story}
                  scene={scene}
                  value={route.target}
                  defaultLabel="Choose where it leads"
                  aria-label={`Route ${i + 1}: where it leads`}
                  invalid={!route.target}
                  onChange={target => setRoute(i, { ...route, target: target ?? '' })}
                  update={update}
                />
                <button type="button" className="icon-btn" aria-label={`Remove route ${i + 1}`} onClick={() => setRoutes(routes.filter((_, j) => j !== i))}>
                  <CloseIcon size={16} />
                </button>
              </div>
              {problem && <p className="ed-error" role="alert">{problem.message}</p>}
            </div>
          )
        })}
        <button
          type="button"
          className="s-btn s-btn--ghost ed-routes__add"
          onClick={() => setRoutes([...routes, { condition: { type: 'item_held' }, target: '' }])}
        >
          + Add a route
        </button>
        <Field label={routes.length ? 'Otherwise go to' : 'Go to'} htmlFor={`scene-next-${scene.id}`} error={nextProblem?.message ?? null}>
          <TargetPicker
            id={`scene-next-${scene.id}`}
            story={story}
            scene={scene}
            value={scene.next}
            defaultLabel={defaultNextTitle(story, scene)}
            invalid={!!nextProblem}
            onChange={next => update(s => patchScene(s, scene.id, { next }))}
            update={update}
          />
        </Field>
      </div>
    </Section>
  )
}

/** Door stories: a door the table can't open until all of these hold. */
function LockedUntil({ story, scene, problems, update }: PathSectionProps) {
  const requires = scene.requires ?? []
  const setRequires = (next: Condition[]) => update(s => patchScene(s, scene.id, { requires: next }))

  return (
    <Section title="Locked until">
      <p className="ed-muted">
        {requires.length
          ? 'The door stays locked until all of these hold. If every other door is played or locked, the last door opens anyway.'
          : 'This door is always open. Lock it until the hero holds an item, or an earlier room went a certain way.'}
      </p>
      <div className="ed-routes">
        {requires.map((condition, i) => {
          const problem = problems.find(p => p.field === 'requires' && p.index === i)
          return (
            <div key={i} className={`ed-route ${problem ? 'has-problem' : ''}`}>
              <div className="ed-route__row">
                <span className="ed-route__word">{i === 0 ? 'Until' : 'and'}</span>
                <ConditionFields
                  story={story}
                  sceneId={scene.id}
                  condition={condition}
                  label={`Lock ${i + 1}`}
                  onChange={next => setRequires(requires.map((c, j) => (j === i ? next : c)))}
                  update={update}
                />
                <button type="button" className="icon-btn" aria-label={`Remove lock ${i + 1}`} onClick={() => setRequires(requires.filter((_, j) => j !== i))}>
                  <CloseIcon size={16} />
                </button>
              </div>
              {problem && <p className="ed-error" role="alert">{problem.message}</p>}
            </div>
          )
        })}
        <button type="button" className="s-btn s-btn--ghost ed-routes__add" onClick={() => setRequires([...requires, { type: 'item_held' }])}>
          + {requires.length ? 'Add another condition' : 'Lock this door'}
        </button>
      </div>
    </Section>
  )
}
