import type { RefObject } from 'react'
import type { AudioFile, Scene, Story, StoryProblem } from '../../types'
import { MOODS } from '../../lib/themes'
import { itemsInStory, newChoices, patchScene } from '../../lib/storyEdit'
import { CloseIcon } from '../../components/Icons'
import { Field, Section, TextArea, TextInput } from './fields'
import { KeyChips } from './KeyChips'
import { ChoiceCards } from './ChoiceCards'
import { ConditionsEditor } from './ConditionsEditor'

interface ScenePanelProps {
  story: Story
  scene: Scene
  problems: StoryProblem[]
  update: (change: (story: Story) => Story) => void
  textTarget: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  audio: AudioFile[]
  onDelete: () => void
}

export function ScenePanel({ story, scene, problems, update, textTarget, audio, onDelete }: ScenePanelProps) {
  const patch = (p: Partial<Scene>) => update(s => patchScene(s, scene.id, p))
  const keyTokens = story.madlib_template.fields.map(f => ({ token: `{${f.key}}`, title: f.label || f.key }))
  const sceneProblems = problems.filter(p => p.scene_id === scene.id)
  const general = sceneProblems.filter(p => !['item_name', 'conditional_text'].includes(p.field ?? ''))
  const number = story.scenes.findIndex(s => s.id === scene.id) + 1

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
          {general.map(p => <li key={p.message}>{p.message}</li>)}
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
        <FinaleSection story={story} scene={scene} patch={patch} textTarget={textTarget} />
      ) : (
        <Section title="Choices">
          <ChoiceCards choices={scene.choices} problems={sceneProblems} onChange={choices => patch({ choices })} />
        </Section>
      )}

      <Section title="Conditional text">
        <ConditionsEditor
          conditions={scene.conditional_text}
          scenes={story.scenes}
          currentSceneId={scene.id}
          problems={sceneProblems}
          onChange={conditional_text => patch({ conditional_text })}
        />
      </Section>
    </div>
  )
}

interface FinaleSectionProps {
  story: Story
  scene: Scene
  patch: (p: Partial<Scene>) => void
  textTarget: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
}

function FinaleSection({ story, scene, patch, textTarget }: FinaleSectionProps) {
  const items = itemsInStory(story)
  const itemTexts = scene.item_texts ?? {}
  const unused = items.filter(item => !itemTexts[item])

  return (
    <Section title="The final roll">
      <Field label="Before the roll" hint="sets up the last challenge" htmlFor="finale-setup">
        <TextArea id="finale-setup" value={scene.finale_setup_text ?? ''} onChange={e => patch({ finale_setup_text: e.target.value })} placeholder="The ghost looms before you…" />
      </Field>

      <KeyChips
        label="Insert an item's text"
        tokens={items.map(item => ({ token: `{item_text:${item}}`, text: item, title: `Only appears if the party found ${item}` }))}
        target={textTarget}
      />

      <div className="ed-grid-2">
        <Field label="Victory" hint="read on a roll of 20+" htmlFor="finale-victory">
          <TextArea id="finale-victory" value={scene.victory_text ?? ''} onChange={e => patch({ victory_text: e.target.value })} rows={5} placeholder="The triumphant ending…" />
        </Field>
        <Field label="Defeat" hint="read when every attempt falls short" htmlFor="finale-defeat">
          <TextArea id="finale-defeat" value={scene.defeat_text ?? ''} onChange={e => patch({ defeat_text: e.target.value })} rows={5} placeholder="The tragic ending…" />
        </Field>
      </div>

      <div className="ed-subsection">
        <span className="ed-label">Item endings</span>
        <p className="ed-muted">Extra lines that appear where you insert an item's text, only if the party found that item.</p>
        {Object.entries(itemTexts).map(([item, texts]) => (
          <div key={item} className="ed-item-ending">
            <div className="ed-item-ending__head">
              <strong>{item}</strong>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${item} endings`}
                onClick={() => {
                  const next = { ...itemTexts }
                  delete next[item]
                  patch({ item_texts: next })
                }}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="ed-grid-2">
              <TextArea aria-label={`${item} on victory`} value={texts.victory ?? ''} placeholder="On victory…" rows={2}
                onChange={e => patch({ item_texts: { ...itemTexts, [item]: { ...texts, victory: e.target.value } } })} />
              <TextArea aria-label={`${item} on defeat`} value={texts.defeat ?? ''} placeholder="On defeat…" rows={2}
                onChange={e => patch({ item_texts: { ...itemTexts, [item]: { ...texts, defeat: e.target.value } } })} />
            </div>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="ed-muted">No items in this story yet: name some in the scenes' item choices.</p>
        ) : unused.length > 0 && (
          <select
            className="ed-input"
            aria-label="Add item endings"
            value=""
            onChange={e => e.target.value && patch({ item_texts: { ...itemTexts, [e.target.value]: { victory: '', defeat: '' } } })}
          >
            <option value="">+ Add endings for an item…</option>
            {unused.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        )}
      </div>
    </Section>
  )
}
