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
  const gone = hadTheirTurn(state)
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
              data-gone={gone.has(p.id) || undefined}
              title={gone.has(p.id) ? `${p.name} has had a turn this round` : `${p.name} hasn't had a turn this round`}
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

/** Who has already decided this round: a round ends once everyone has had as many turns as
 *  the busiest player, so a player marked here can wait while the others catch up. */
function hadTheirTurn(state: GameState): Set<string> {
  const turns = new Map(state.players.map(p => [p.id, 0]))
  for (const h of state.history) {
    if (h.decided_by && turns.has(h.decided_by)) turns.set(h.decided_by, turns.get(h.decided_by)! + 1)
  }
  const fewest = Math.min(...turns.values())
  return new Set([...turns].filter(([, n]) => n > fewest).map(([id]) => id))
}
