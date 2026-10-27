import { useState } from 'react'
import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, Story } from '../../types'
import { ConfirmDialog } from '../../components'
import { LockIcon } from '../../components/Icons'
import { outcomeLabel, OUTCOME_ICON } from '../../lib/outcomes'
import { recap, sceneName } from '../../lib/story'

interface SceneSelectProps {
  state: GameState
  story: Story
  run: RunAction
}

/** Non-linear stories: the table picks the next door (or revisits one). */
export function SceneSelect({ state, story, run }: SceneSelectProps) {
  const [pendingRevisit, setPendingRevisit] = useState<{ sceneId: string; title: string; outcome: string } | null>(null)

  const playedIds = new Set(state.history.map(h => h.scene_id))
  const allNonFinalesPlayed = story.scenes.filter(s => !s.is_finale).every(s => playedIds.has(s.id))
  const previously = recap(story, state.history.at(-1))

  return (
    <article>
      {previously && (
        <p className="recap">
          <span className="stage-label">Previously</span>
          <span className="recap__text">{previously.scene}: you {previously.outcome}.</span>
        </p>
      )}
      <div className="eyebrow ink">The way forward</div>
      <h1 className="stage-title ink">Which door next?</h1>

      <div className="door-grid">
        {story.scenes.map(scene => {
          const historyEntry = state.history.find(h => h.scene_id === scene.id)
          const choiceMade = historyEntry ? scene.choices[historyEntry.choice_index] : null
          const locked = !!scene.is_finale && !allNonFinalesPlayed
          const Icon = choiceMade ? OUTCOME_ICON[choiceMade.kind] : null

          function handleClick() {
            if (locked) return
            if (choiceMade) {
              setPendingRevisit({ sceneId: scene.id, title: sceneName(scene), outcome: outcomeLabel(choiceMade) })
            } else {
              run(() => api.selectScene(scene.id), 'Failed to select scene')
            }
          }

          return (
            <button
              key={scene.id}
              className={`door ${choiceMade ? 'door--played' : ''} ${locked ? 'door--locked' : ''}`}
              onClick={handleClick}
              aria-disabled={locked}
            >
              <span className="door__name">{sceneName(scene)}</span>
              <span className="door__meta">
                {locked && <><LockIcon size={14} /> Sealed until every other door is opened</>}
                {!locked && choiceMade && Icon && (
                  <><Icon size={14} className={`outcome--${choiceMade.kind}`} /> Played · {outcomeLabel(choiceMade)} · revisit</>
                )}
                {!locked && !choiceMade && (scene.is_finale ? 'The last door' : 'Unopened')}
              </span>
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
        title="Revisit this scene?"
        message={pendingRevisit ? `Playing "${pendingRevisit.title}" again undoes its outcome (${pendingRevisit.outcome}).` : ''}
        confirmText="Revisit"
        variant="default"
      />
    </article>
  )
}
