import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, ResolvedContent } from '../../types'
import { FinaleRoll } from './FinaleRoll'

interface GameOverProps {
  state: GameState
  resolved: ResolvedContent | null
  run: RunAction
  onReturnToLibrary: () => void
}

export function GameOver({ state, resolved, run, onReturnToLibrary }: GameOverProps) {
  if (!state.outcome) {
    // Last linear scene played: waiting on the physical d20 roll
    return (
      <div className="run-content--narrow text-center">
        <h1 className="mb-lg">Final Showdown!</h1>
        <FinaleRoll state={state} resolved={resolved} run={run} infoClassName="card mb-lg" />
      </div>
    )
  }

  const victory = state.outcome === 'victory'
  return (
    <div className="run-content--narrow text-center">
      <h1 className={`text-5xl mb-lg ${victory ? 'text-success' : 'text-danger'}`} aria-live="assertive">
        {victory ? 'VICTORY!' : 'DEFEAT'}
      </h1>
      <div className="mb-xl">
        <p>Level: {state.level}</p>
        <p>Items: {state.items.length}</p>
        {state.items.length > 0 && <p className="text-secondary">{state.items.join(', ')}</p>}
      </div>
      {state.outcome_revealed ? (
        <button className="btn" onClick={onReturnToLibrary}>
          Return to Library
        </button>
      ) : (
        <button className="btn btn--success" onClick={() => run(api.revealOutcome, 'Failed to reveal outcome')}>
          Reveal to Players
        </button>
      )}
    </div>
  )
}
