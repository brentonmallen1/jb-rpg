import { useEffect, useState } from 'react'
import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, Story } from '../../types'
import { ContentBox } from '../../components'

interface MadlibStepProps {
  state: GameState
  story: Story
  run: RunAction
  pending: boolean
}

export function MadlibStep({ state, story, run, pending }: MadlibStepProps) {
  const fields = story.madlib_template.fields
  const field = fields[state.madlib_step]
  const [input, setInput] = useState('')
  const [inputNode, setInputNode] = useState<HTMLInputElement | null>(null)

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

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const answer = input.trim()
    if (!answer || pending) return
    run(() => api.submitMadlib(answer), 'Failed to submit')
  }

  const inputId = 'madlib-input'
  return (
    <ContentBox width="narrow" centered>
      <h1 className="mb-lg">Character Creation</h1>
      <div className="card mb-lg">
        <p className="prose">{story.madlib_template.prompt}</p>
      </div>
      <div className="text-secondary mb-md">
        Field {state.madlib_step + 1} of {fields.length}
      </div>
      <form onSubmit={submit}>
        <label htmlFor={inputId} className="text-xl mb-sm" style={{ display: 'block' }}>
          {field.label}
        </label>
        {field.hint && <div className="text-secondary text-sm mb-sm italic">({field.hint})</div>}
        <div className="text-secondary text-sm mb-sm">
          → fills <code className="code-inline">{'{' + field.key + '}'}</code>
        </div>
        <input
          ref={setInputNode}
          key={state.madlib_step}
          id={inputId}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          className="input w-full mb-md"
          autoFocus
          disabled={pending}
        />
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          {state.madlib_step > 0 && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => run(api.madlibBack, 'Failed to go back')}
              disabled={pending}
            >
              Back
            </button>
          )}
          <button type="submit" className="btn" disabled={!input.trim() || pending}>
            {pending ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
    </ContentBox>
  )
}
