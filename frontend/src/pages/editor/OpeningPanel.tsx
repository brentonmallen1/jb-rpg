import { useState, type RefObject } from 'react'
import type { OpeningScene, Story, StoryProblem } from '../../types'
import { describeCondition } from '../../lib/storyEdit'
import { CloseIcon } from '../../components/Icons'
import { Field, Section, TextArea, TextInput } from './fields'
import { KeyChips } from './KeyChips'
import { ConditionsEditor } from './ConditionsEditor'
import { WritingDialog, type WritingEntry } from './WritingDialog'
import { TargetPicker } from './pickers'

interface OpeningPanelProps {
  story: Story
  opening: OpeningScene
  problems: StoryProblem[]
  update: (change: (story: Story) => Story) => void
  textTarget: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
}

/** The prologue: read after the character is revealed, before the first scene. */
export function OpeningPanel({ story, opening, problems, update, textTarget }: OpeningPanelProps) {
  const patch = (p: Partial<OpeningScene>) =>
    update(s => (s.opening_scene ? { ...s, opening_scene: { ...s.opening_scene, ...p } } : s))
  const openingProblems = problems.filter(p => p.area === 'opening')
  const keyTokens = story.madlib_template.fields.map(f => ({ token: `{${f.key}}`, title: f.label || f.key }))
  const [writing, setWriting] = useState<string | null>(null)
  const entries: WritingEntry[] = [
    { id: 'opening-text', group: 'Read aloud', label: 'The prologue', sub: 'before the first scene', value: opening.base_text, onChange: base_text => patch({ base_text }) },
    ...opening.conditional_text.map((ct, i) => ({
      id: `line-${i}`,
      group: 'Read aloud',
      label: `If ${describeCondition(story, ct.condition)}`,
      sub: 'added after the prologue',
      value: ct.text,
      onChange: (text: string) => patch({ conditional_text: opening.conditional_text.map((c, j) => (j === i ? { ...c, text } : c)) }),
    })),
  ]
  const firstScene = story.scenes[0]

  return (
    <div className="ed-panel">
      <div className="ed-panel__head">
        <span className="stage-label">Prologue</span>
        <button type="button" className="s-btn s-btn--ghost" onClick={() => update(s => ({ ...s, opening_scene: undefined }))}>
          Remove prologue
        </button>
      </div>
      <input className="ed-title-input" aria-label="Prologue title" value={opening.title} onChange={e => patch({ title: e.target.value })} />

      <KeyChips label="Insert a character detail" tokens={keyTokens} target={textTarget} />

      <Field label="The prologue" hint="read aloud before the first scene" htmlFor="opening-text">
        <TextArea id="opening-text" className="ed-textarea--reading" rows={6} value={opening.base_text} onChange={e => patch({ base_text: e.target.value })} onExpand={() => setWriting('opening-text')} />
      </Field>

      <Section
        title="Where can the party go?"
        aside={opening.choices.length < 3 && (
          <button type="button" className="s-btn s-btn--ghost" onClick={() => patch({ choices: [...opening.choices, { text: '', target_scene_id: undefined }] })}>
            + Add a path
          </button>
        )}
      >
        {opening.choices.length === 0 && (
          <p className="ed-muted">
            With no paths, the storyteller presses "Choose your path" and the story begins
            {story.settings.non_linear ? ' with the party choosing a door.' : ' at the first scene.'}
          </p>
        )}
        {opening.choices.map((choice, i) => {
          const problem = openingProblems.find(p => p.field === 'target_scene_id' && p.index === i)
          return (
            <div key={i} className="ed-path">
              <TextInput
                aria-label={`Path ${i + 1}`}
                value={choice.text}
                placeholder="Take the left passage"
                onChange={e => patch({ choices: opening.choices.map((c, j) => (j === i ? { ...c, text: e.target.value } : c)) })}
              />
              <TargetPicker
                story={story}
                allowEnd={false}
                value={choice.target_scene_id}
                defaultLabel={story.settings.non_linear ? 'The party picks a door' : `The first scene${firstScene ? ` (${firstScene.title || 'Untitled scene'})` : ''}`}
                aria-label={`Where path ${i + 1} leads`}
                invalid={!!problem}
                onChange={target => patch({ choices: opening.choices.map((c, j) => (j === i ? { ...c, target_scene_id: target ?? undefined } : c)) })}
                update={update}
              />
              <button type="button" className="icon-btn" aria-label={`Remove path ${i + 1}`} onClick={() => patch({ choices: opening.choices.filter((_, j) => j !== i) })}>
                <CloseIcon size={16} />
              </button>
              {problem && <p className="ed-error" role="alert">{problem.message}</p>}
            </div>
          )
        })}
      </Section>

      <Section title="Text that changes">
        <ConditionsEditor
          conditions={opening.conditional_text}
          story={story}
          update={update}
          problems={openingProblems}
          onChange={conditional_text => patch({ conditional_text })}
          onWrite={i => setWriting(`line-${i}`)}
        />
      </Section>

      <WritingDialog title={opening.title || 'Prologue'} entries={entries} openId={writing} onClose={() => setWriting(null)} />
    </div>
  )
}
