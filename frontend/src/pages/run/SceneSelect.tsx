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
import { describeCondition } from '../../lib/storyEdit'

interface SceneSelectProps {
  state: GameState
  resolved: ResolvedContent
  story: Story
  run: RunAction
}

/** Non-linear stories: the table picks the next door (or revisits one). */
export function SceneSelect({ state, resolved, story, run }: SceneSelectProps) {
  const [pendingRevisit, setPendingRevisit] = useState<{ sceneId: string; title: string; outcome: string } | null>(null)

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
        {(resolved.doors ?? []).flatMap(door => {
          const scene = story.scenes.find(s => s.id === door.id)
          return scene ? [{ door, scene }] : []
        }).map(({ door, scene }) => {
          // What the table chose there, as history recorded it
          const historyEntry = state.history.find(h => h.scene_id === scene.id)
          const choiceMade = historyEntry ? { kind: historyEntry.outcome, item_name: historyEntry.item_name, item_icon: historyEntry.item_icon } : null
          const locked = door.locked || door.sealed
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
                {door.sealed && <><LockIcon size={14} /> Sealed until every other door is opened</>}
                {door.locked && <><LockIcon size={14} /> Locked until {(scene.requires ?? []).map(c => describeCondition(story, c)).join(' and ')}</>}
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
