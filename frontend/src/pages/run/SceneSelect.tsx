import { useState } from 'react'
import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, Story } from '../../types'
import { ConfirmDialog, HPDisplay, StatsRow, ThemedScope } from '../../components'
import { outcomeLabel } from '../../lib/outcomes'

interface SceneSelectProps {
  state: GameState
  story: Story
  colorMode: 'light' | 'dark'
  run: RunAction
  onError: (message: string) => void
}

/** Non-linear stories: the storyteller picks the next scene (or revisits one). */
export function SceneSelect({ state, story, colorMode, run, onError }: SceneSelectProps) {
  const [pendingRevisit, setPendingRevisit] = useState<{ sceneId: string; title: string; outcome: string } | null>(null)

  const playedIds = new Set(state.history.map(h => h.scene_id))
  const allNonFinalesPlayed = story.scenes.filter(s => !s.is_finale).every(s => playedIds.has(s.id))

  return (
    <div className="run-content--narrow">
      <h1 className="mb-md">Select Next Scene</h1>

      <ThemedScope theme={story.theme} colorMode={colorMode}>
        <div className="run-stats-row">
          <HPDisplay hp={state.hp} />
          <StatsRow level={state.level} itemCount={state.items.length} />
        </div>
      </ThemedScope>

      <div className="stack gap-md">
        {story.scenes.map(scene => {
          const historyEntry = state.history.find(h => h.scene_id === scene.id)
          const choiceMade = historyEntry ? scene.choices[historyEntry.choice_index] : null
          const locked = scene.is_finale && !allNonFinalesPlayed
          const isCurrent = scene.id === state.current_scene_id

          function handleClick() {
            if (locked) {
              onError('Complete all scenes before accessing the finale')
            } else if (choiceMade) {
              setPendingRevisit({ sceneId: scene.id, title: scene.display_name || scene.title, outcome: outcomeLabel(choiceMade) })
            } else {
              run(() => api.selectScene(scene.id), 'Failed to select scene')
            }
          }

          return (
            <button
              key={scene.id}
              className="card"
              onClick={handleClick}
              aria-current={isCurrent ? 'true' : undefined}
              aria-disabled={locked}
              style={{
                textAlign: 'left',
                cursor: locked ? 'not-allowed' : 'pointer',
                border: isCurrent ? '2px solid var(--accent)' : undefined,
                opacity: locked ? 0.4 : choiceMade ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {scene.display_name || scene.title}
                  {scene.is_finale && <span className="text-sm text-secondary"> (Finale)</span>}
                </div>
                {historyEntry && <span className="text-sm text-secondary" style={{ fontStyle: 'italic' }}>Played</span>}
                {locked && <span className="text-sm text-secondary" style={{ fontStyle: 'italic' }}>🔒</span>}
              </div>
              {choiceMade ? (
                <div className="text-sm" style={{ color: 'var(--accent)' }}>{outcomeLabel(choiceMade)}</div>
              ) : (
                <div className="text-secondary text-sm">{scene.base_text.slice(0, 100)}...</div>
              )}
            </button>
          )
        })}
      </div>

      <ConfirmDialog
        isOpen={!!pendingRevisit}
        onConfirm={async () => {
          if (!pendingRevisit) return
          if (await run(() => api.selectScene(pendingRevisit.sceneId, true), 'Failed to revisit scene')) {
            setPendingRevisit(null)
          }
        }}
        onCancel={() => setPendingRevisit(null)}
        title="Revisit Scene?"
        message={pendingRevisit ? `Revisiting "${pendingRevisit.title}" will revert: ${pendingRevisit.outcome}` : ''}
        confirmText="Revisit"
        variant="default"
      />
    </div>
  )
}
