import type { MadLibField, Story, StoryProblem } from '../../types'
import { MADLIB_PRESETS } from '../../lib/madlibPresets'
import { fieldsForTemplate, fillSample, scenesUsing } from '../../lib/storyEdit'
import { Field, Section, TextArea, TextInput } from './fields'

interface CharactersPanelProps {
  story: Story
  problems: StoryProblem[]
  samples: Record<string, string>
  onSamples: (samples: Record<string, string>) => void
  update: (change: (story: Story) => Story) => void
}

/** Character creation: a template with {blanks}, filled by indirect questions to the table. */
export function CharactersPanel({ story, problems, samples, onSamples, update }: CharactersPanelProps) {
  const template = story.madlib_template
  const charProblems = problems.filter(p => p.area === 'characters')

  const setPrompt = (prompt: string) =>
    update(s => ({ ...s, madlib_template: { prompt, fields: fieldsForTemplate(prompt, s.madlib_template.fields) } }))
  const setField = (i: number, patch: Partial<MadLibField>) =>
    update(s => ({
      ...s,
      madlib_template: { ...s.madlib_template, fields: s.madlib_template.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) },
    }))

  return (
    <div className="ed-panel">
      <div className="ed-panel__head">
        <span className="stage-label">Character creation</span>
      </div>
      <h2 className="ed-panel__title">Who is the hero?</h2>
      <p className="ed-muted">
        The table builds the hero by answering questions without knowing what each answer is for.
        Write a description with <code>{'{blanks}'}</code>; every blank becomes a question.
      </p>

      {charProblems.length > 0 && (
        <ul className="ed-problems" role="status">{charProblems.map(p => <li key={p.message}>{p.message}</li>)}</ul>
      )}

      <Section title="Start from a preset">
        <div className="ed-presets">
          {Object.entries(MADLIB_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              className="ed-preset"
              onClick={() => {
                update(s => ({ ...s, madlib_template: { prompt: preset.prompt, fields: preset.fields.map(f => ({ ...f })) } }))
                onSamples({})
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </Section>

      <Field label="The hero's description" hint="type {name}, {fear}… to make a blank" htmlFor="char-template">
        <TextArea
          id="char-template"
          className="ed-textarea--reading"
          rows={4}
          value={template.prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="{name} the {profession} has a secret weakness: {weakness}."
        />
      </Field>
      {template.prompt && (
        <p className="ed-sample" aria-label="With the sample answers">
          {fillSample(template.prompt, samples)}
        </p>
      )}

      <Section title={`Questions (${template.fields.length})`}>
        {template.fields.length === 0 && <p className="ed-muted">No blanks yet. Add <code>{'{key}'}</code> to the description above.</p>}
        {template.fields.map((field, i) => {
          const used = scenesUsing(story, field.key)
          return (
            <article key={field.key} className="ed-question">
              <header className="ed-question__head">
                <code className="ed-token">{`{${field.key}}`}</code>
                <span className="ed-muted">{used.length ? `also used in ${used.map(s => s.title).join(', ')}` : 'only in the description'}</span>
              </header>
              <Field label="Question asked of the table" htmlFor={`q-${field.key}`}>
                <TextInput id={`q-${field.key}`} value={field.label} onChange={e => setField(i, { label: e.target.value })} placeholder="What keeps you up at 3am?" />
              </Field>
              <div className="ed-grid-2">
                <Field label="Hint for the storyteller" htmlFor={`h-${field.key}`}>
                  <TextInput id={`h-${field.key}`} value={field.hint ?? ''} onChange={e => setField(i, { hint: e.target.value })} placeholder="a fear or worry" />
                </Field>
                <Field label="Sample answer" hint="for previews only" htmlFor={`s-${field.key}`}>
                  <TextInput id={`s-${field.key}`} value={samples[field.key] ?? ''} onChange={e => onSamples({ ...samples, [field.key]: e.target.value })} placeholder="spiders" />
                </Field>
              </div>
            </article>
          )
        })}
      </Section>

      <details className="ed-tips">
        <summary>Writing good questions</summary>
        <p><strong>Ask sideways.</strong> Don't reveal how an answer will be used:</p>
        <ul>
          <li>Instead of "What's your weakness?" ask "What keeps you up at 3am?"</li>
          <li>Instead of "What's your goal?" ask "If you had one wish, what would it be?"</li>
          <li>Instead of "What's your job?" ask "What would you do if money didn't matter?"</li>
          <li>Instead of "Where are you from?" ask "Describe a place that smells like memories."</li>
        </ul>
      </details>
    </div>
  )
}
