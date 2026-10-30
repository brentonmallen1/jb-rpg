import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, ResolvedContent } from '../../types'

interface TurnLineProps {
  state: GameState
  decider: ResolvedContent['decider']
  run: RunAction
  /** What the decider decides: this scene's choice, or the next door */
  what?: string
}

/** Taking turns: who decides, and (when the storyteller picks) the players to choose from. */
export function TurnLine({ state, decider, run, what = 'this one' }: TurnLineProps) {
  if (!['rotate', 'pick'].includes(state.turn_mode)) return null
  return (
    <div className="turn-line">
      {decider ? (
        <span className="turn-line__who"><strong>{decider.name}</strong> decides {what}</span>
      ) : state.turn_mode === 'pick' ? (
        <span className="turn-line__who">Who decides {what}?</span>
      ) : (
        <span className="turn-line__who">Waiting for players to join by name</span>
      )}
      {state.turn_mode === 'pick' && state.players.length > 0 && (
        <div className="turn-line__pick storyteller-only" role="group" aria-label="Choose who decides">
          {state.players.map(p => (
            <button
              key={p.id}
              className="chip-btn"
              aria-pressed={decider?.id === p.id}
              onClick={() => run(() => api.setDecider(decider?.id === p.id ? null : p.id), 'Failed to choose who decides')}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
