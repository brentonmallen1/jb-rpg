import { useEffect, useState } from 'react'
import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, Story } from '../../types'
import { EyeIcon, EyeOffIcon } from '../../components/Icons'

interface MadlibStepProps {
  state: GameState
  story: Story
  run: RunAction
  pending: boolean
}

/** Character creation: ask each question; the template stays sealed so the table can't guess. */
export function MadlibStep({ state, story, run, pending }: MadlibStepProps) {
  const fields = story.madlib_template.fields
  const field = fields[state.madlib_step]
  const [input, setInput] = useState('')
  const [inputNode, setInputNode] = useState<HTMLInputElement | null>(null)
  const [peek, setPeek] = useState(false)

  // Pre-fill with the saved answer whenever the question changes (e.g. after going back)
  const [prefilledKey, setPrefilledKey] = useState<string | undefined>(undefined)
  if (field?.key !== prefilledKey) {
    setPrefilledKey(field?.key)
    setInput(field ? state.madlib_answers[field.key] ?? '' : '')
  }

  useEffect(() => {
    if (inputNode && !pending) inputNode.focus()
  }, [inputNode, pending, state.madlib_step])

  if (!field) return null
  const isLast = state.madlib_step === fields.length - 1

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const answer = input.trim()
    if (!answer || pending) return
    run(() => api.submitMadlib(answer), 'Failed to submit')
  }

  // The template with every blank sealed (or shown, while peeking)
  const parts = story.madlib_template.prompt.split(/\{(\w+)\}/)
  const answers = fields.map(f => state.madlib_answers[f.key]).filter((a): a is string => !!a)

  return (
    <article className="madlib">
      <form onSubmit={submit}>
        <div className="madlib__steps" aria-label={`Question ${state.madlib_step + 1} of ${fields.length}`}>
          {fields.map((f, i) => (
            <span
              key={f.key}
              className={`madlib__dot ${i < state.madlib_step ? 'is-done' : ''} ${i === state.madlib_step ? 'is-current' : ''}`}
            />
          ))}
          <span className="stage-label" style={{ marginLeft: 8 }}>Question {state.madlib_step + 1} of {fields.length}</span>
        </div>

        <label htmlFor="madlib-input" className="madlib__question ink" key={field.key}>{field.label}</label>
        {field.hint && <p className="madlib__hint storyteller-only">Looking for: {field.hint}</p>}

        <input
          ref={setInputNode}
          key={state.madlib_step}
          id="madlib-input"
          className="madlib__input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          autoComplete="off"
          disabled={pending}
        />
        <p className="stage-hint storyteller-only" style={{ marginLeft: 0, marginTop: 10 }}>
          Type what the table calls out. Enter to lock it in.
        </p>

        <div className="action-row">
          {state.madlib_step > 0 && (
            <button type="button" className="s-btn s-btn--ghost" onClick={() => run(api.madlibBack, 'Failed to go back')} disabled={pending}>
              Previous question
            </button>
          )}
          <button type="submit" className="s-btn" disabled={!input.trim() || pending}>
            {isLast ? 'Seal the character' : 'Lock it in'} <span className="kbd">⏎</span>
          </button>
        </div>
      </form>

      <aside className="sealed" aria-label="Character so far">
        <div className="section-label" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
          <span className="stage-label">The character: sealed</span>
          <button
            type="button"
            className="icon-btn storyteller-only"
            aria-pressed={peek}
            aria-label={peek ? 'Hide the template' : 'Peek at the template'}
            onClick={() => setPeek(!peek)}
          >
            {peek ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
        <p className="sealed__text">
          {parts.map((part, i) => {
            if (i % 2 === 0) return part
            if (!peek) return <span key={i} className="seal" />
            return <strong key={i}>{state.madlib_answers[part] ?? `{${part}}`}</strong>
          })}
        </p>
        {answers.length > 0 && (
          <div>
            <span className="stage-label">Answers so far</span>
            <div className="chips" style={{ marginTop: 8 }}>
              {answers.map((a, i) => <span key={i} className="chip">{a}</span>)}
            </div>
          </div>
        )}
      </aside>
    </article>
  )
}
