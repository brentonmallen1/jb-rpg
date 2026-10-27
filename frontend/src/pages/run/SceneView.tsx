import { useState } from 'react'
import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { Choice, GameState, ResolvedContent, Story } from '../../types'
import { HPDisplay, Modal, StatsRow, ThemedScope } from '../../components'
import { outcomeLabel } from '../../lib/outcomes'
import { FinaleRoll } from './FinaleRoll'

interface SceneViewProps {
  state: GameState
  resolved: ResolvedContent
  story: Story
  colorMode: 'light' | 'dark'
  run: RunAction
  pending: boolean
}

const OUTCOME_TEXT_CLASS = { damage: 'text-danger', item: 'text-success', level: 'text-warning' } as const

/** A running scene. Rendered with key={scene id}, so local reveal state resets per scene. */
export function SceneView({ state, resolved, story, colorMode, run, pending }: SceneViewProps) {
  const [revealedToMe, setRevealedToMe] = useState(false)
  const [pendingChoice, setPendingChoice] = useState<{ visualIndex: number; choice: Choice } | null>(null)
  const scene = story.scenes.find(s => s.id === state.current_scene_id)

  async function confirmChoice() {
    if (!pendingChoice || pending) return
    if (await run(() => api.makeChoice(pendingChoice.visualIndex), 'Failed to make choice')) {
      setPendingChoice(null)
    }
  }

  function renderChoices() {
    if (scene?.is_finale) {
      return (
        <div className="text-center">
          {scene.finale_setup_text && (
            <div className="card mb-lg">
              <p className="prose">{scene.finale_setup_text}</p>
            </div>
          )}
          <FinaleRoll state={state} resolved={resolved} run={run} infoClassName="mb-lg text-secondary" />
        </div>
      )
    }

    // Storyteller hasn't looked at the choices yet
    if (!revealedToMe && !state.shuffled_indices.length) {
      return (
        <div className="text-center">
          <button
            className="btn"
            onClick={() => run(async () => {
              await api.revealChoices(false) // shuffle, but don't show players yet
              setRevealedToMe(true)
            }, 'Failed to reveal choices')}
          >
            Reveal Choices
          </button>
        </div>
      )
    }

    return (
      <>
        <div className="stack gap-md">
          {state.shuffled_indices.map((originalIndex, visualIndex) => {
            const choice = scene?.choices[originalIndex]
            if (!choice) return null
            return (
              <button
                key={visualIndex}
                className={`btn choice-btn choice-btn--${choice.kind} text-left`}
                onClick={() => setPendingChoice({ visualIndex, choice })}
                style={{ padding: 'var(--space-md)' }}
              >
                <div>{choice.display_text}</div>
                <div className="text-sm mt-xs" style={{ opacity: 0.8 }}>{outcomeLabel(choice)}</div>
              </button>
            )
          })}
        </div>
        <div className="text-center mt-md">
          <button
            className={`btn ${state.choices_revealed ? 'btn--secondary' : ''}`}
            onClick={() => run(() => api.revealChoices(true), 'Failed to show choices')}
          >
            {state.choices_revealed ? 'Remind Players of Choices' : 'Show Choices to Players'}
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="run-content">
      {state.character && (
        <div className="card mb-lg">
          <div className="font-semibold mb-xs">{state.character.name}</div>
          <div className="text-secondary">{resolved.character_description}</div>
        </div>
      )}

      <ThemedScope theme={story.theme} colorMode={colorMode}>
        <div className="mb-lg">
          <HPDisplay hp={state.hp} />
        </div>
        <div className="mb-lg">
          <StatsRow level={state.level} itemCount={state.items.length} />
        </div>
      </ThemedScope>

      <div className="card mb-lg">
        <p className="prose">{resolved.scene_text}</p>
      </div>

      {renderChoices()}

      {/* Non-linear stories replay scenes from scene selection instead */}
      {state.history.length > 0 && !story.settings.non_linear && (
        <div className="text-center mt-lg">
          <button className="btn btn--secondary" onClick={() => run(api.goBack, 'Failed to go back')}>
            Go Back
          </button>
        </div>
      )}

      <Modal isOpen={!!pendingChoice} onClose={() => setPendingChoice(null)} title="Choice Result">
        {pendingChoice && (
          <>
            <div
              className={OUTCOME_TEXT_CLASS[pendingChoice.choice.kind]}
              style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-md)', textAlign: 'center' }}
            >
              {outcomeLabel(pendingChoice.choice)}
            </div>
            <div className="card mb-lg">
              <p className="prose">{pendingChoice.choice.result_text}</p>
            </div>
            <div className="btn-group">
              <button className="btn" onClick={confirmChoice} disabled={pending}>
                Continue
              </button>
              <button className="btn btn--secondary" onClick={() => setPendingChoice(null)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
