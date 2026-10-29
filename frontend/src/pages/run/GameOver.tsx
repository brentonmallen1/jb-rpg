import { useState } from 'react'
import * as api from '../../hooks/api'
import { ItemIcon, KeepsakeDialog } from '../../components'
import { useHotkeys } from '../../hooks/useHotkeys'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, ResolvedContent, Story } from '../../types'
import { OUTCOME_ICON } from '../../lib/outcomes'
import { sceneName } from '../../lib/story'
import { FinaleRoll } from './FinaleRoll'

interface GameOverProps {
  state: GameState
  resolved: ResolvedContent | null
  story: Story
  run: RunAction
  onReturnToLibrary: () => void
}

const OUTCOME_WORDS = { damage: 'lost a life', item: 'found', level: 'grew stronger' } as const

export function GameOver({ state, resolved, story, run, onReturnToLibrary }: GameOverProps) {
  const [showKeepsake, setShowKeepsake] = useState(false)
  useHotkeys({ enter: state.outcome && state.outcome_revealed && !showKeepsake ? onReturnToLibrary : undefined })

  if (!state.outcome || (!state.outcome_revealed && state.final_rolls?.length)) {
    // The finale: waiting on the d20 (or the digital dice have decided and the storyteller tells it)
    return (
      <article>
        <div className="eyebrow ink">Everything comes down to this</div>
        <h1 className="stage-title ink">The final roll</h1>
        <FinaleRoll state={state} resolved={resolved} run={run} />
      </article>
    )
  }

  const victory = state.outcome === 'victory'
  return (
    <article>
      <div className="eyebrow ink">{state.character ? `The tale of ${state.character.name}` : story.title}</div>
      <h1 className={`outcome-title ink outcome-title--${state.outcome}`} aria-live="assertive">
        {victory ? 'Victory' : 'Defeat'}
      </h1>
      <p className="scene-text">
        Level {state.level} · {state.items.length === 1 ? '1 item' : `${state.items.length} items`}
        {state.items.length > 0 && `: ${state.items.join(', ')}`}
      </p>

      {state.history.length > 0 && (
        <>
          <span className="stage-label">The path you took</span>
          <ol className="path">
            {state.history.map((entry, i) => {
              const scene = story.scenes.find(s => s.id === entry.scene_id)
              const Icon = OUTCOME_ICON[entry.outcome]
              return (
                <li key={`${entry.scene_id}-${i}`}>
                  {entry.outcome === 'item' && entry.item_name
                    ? <ItemIcon name={entry.item_name} icon={entry.item_icon} theme={story.theme} size={16} className="outcome--item" />
                    : <Icon size={16} className={`outcome--${entry.outcome}`} />}
                  <span>{scene ? sceneName(scene) : entry.scene_id}</span>
                  <span className={`outcome outcome--${entry.outcome}`}>
                    {OUTCOME_WORDS[entry.outcome]}{entry.outcome === 'item' && entry.item_name ? ` ${entry.item_name}` : ''}
                  </span>
                </li>
              )
            })}
          </ol>
        </>
      )}

      <div className="action-row">
        {state.outcome_revealed && resolved && (
          <button className="s-btn s-btn--ghost" onClick={() => setShowKeepsake(true)}>The keepsake</button>
        )}
        {state.outcome_revealed ? (
          <button className="s-btn" onClick={onReturnToLibrary}>
            End session and return to library <span className="kbd">⏎</span>
          </button>
        ) : (
          <button className="s-btn" onClick={() => run(api.revealOutcome, 'Failed to reveal outcome')}>
            Reveal to players
          </button>
        )}
      </div>
      {resolved && <KeepsakeDialog open={showKeepsake} state={state} resolved={resolved} onClose={() => setShowKeepsake(false)} />}
    </article>
  )
}
