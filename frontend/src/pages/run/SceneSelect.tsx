import { useState } from 'react'
import { useHotkeys } from '../../hooks/useHotkeys'
import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, ResolvedContent, Story } from '../../types'
import { TurnLine } from './TurnLine'
import { ConfirmDialog } from '../../components'
import { LockIcon } from '../../components/Icons'
import { outcomeLabel } from '../../lib/outcomes'
import { ChoiceOutcomeIcon } from '../../components/ItemIcon'
import { recap, sceneName } from '../../lib/story'

interface SceneSelectProps {
  state: GameState
  resolved: ResolvedContent
  story: Story
  run: RunAction
}

/** Non-linear stories: the table picks the next door (or revisits one). */
export function SceneSelect({ state, resolved, story, run }: SceneSelectProps) {
  const [pendingRevisit, setPendingRevisit] = useState<{ sceneId: string; title: string; outcome: string } | null>(null)

  const playedIds = new Set(state.history.map(h => h.scene_id))
  const allNonFinalesPlayed = story.scenes.filter(s => !s.is_finale).every(s => playedIds.has(s.id))
  const previously = recap(story, state.history.at(-1))
  useHotkeys({ s: state.doors_dealt ? undefined : () => run(api.dealDoors, 'Could not deal the doors') })

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
      <TurnLine state={state} decider={resolved.decider} run={run} what="the next door" />
      <div className="action-row" style={{ marginTop: 12 }}>
        {state.doors_dealt ? (
          <span className="stage-hint storyteller-only" style={{ marginLeft: 0 }}>The doors are on the phones.</span>
        ) : (
          <button className="s-btn s-btn--ghost storyteller-only" onClick={() => run(api.dealDoors, 'Could not deal the doors')}>
            Deal the doors to the table <span className="kbd">S</span>
          </button>
        )}
      </div>

      <div className="door-grid">
        {story.scenes.map(scene => {
          const historyEntry = state.history.find(h => h.scene_id === scene.id)
          const choiceMade = historyEntry ? scene.choices[historyEntry.choice_index] : null
          const locked = !!scene.is_finale && !allNonFinalesPlayed
          const picked = state.door_proposal === scene.id

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
              className={`door ${choiceMade ? 'door--played' : ''} ${locked ? 'door--locked' : ''} ${picked ? 'is-picked' : ''}`}
              onClick={handleClick}
              aria-disabled={locked}
            >
              <span className="door__name">{sceneName(scene)}</span>
              {picked && resolved.decider && <span className="door__pick">{resolved.decider.name}'s pick</span>}
              <span className="door__meta">
                {locked && <><LockIcon size={14} /> Sealed until every other door is opened</>}
                {!locked && choiceMade && (
                  <><ChoiceOutcomeIcon choice={choiceMade} theme={story.theme} size={14} className={`outcome--${choiceMade.kind}`} /> Played · {outcomeLabel(choiceMade)} · revisit</>
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
