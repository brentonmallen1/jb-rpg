import { useState } from 'react'
import * as api from '../../hooks/api'
import { useHotkeys } from '../../hooks/useHotkeys'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, ResolvedContent } from '../../types'
import { D20Icon } from '../../components/Icons'

interface FinaleRollProps {
  state: GameState
  resolved: ResolvedContent | null
  run: RunAction
}

/** The d20 roll: the table rolls real dice; the storyteller records the result and reads its text. */
export function FinaleRoll({ state, resolved, run }: FinaleRollProps) {
  const [pendingOutcome, setPendingOutcome] = useState<'victory' | 'defeat' | null>(null)
  const outcomeText = pendingOutcome === 'victory' ? resolved?.victory_text : resolved?.defeat_text
  const attempts = state.level

  function confirm() {
    if (!pendingOutcome) return
    run(() => api.finish(pendingOutcome), 'Failed to finish game')
  }

  useHotkeys({
    enter: pendingOutcome ? confirm : undefined,
    escape: pendingOutcome ? () => setPendingOutcome(null) : undefined,
  })

  return (
    <>
      <div className="roll">
        <D20Icon size={128} className="d20" />
        <div className="roll__stats">
          <div>
            <span className="stage-label">Bonus</span>
            <div className="roll__value">+{state.items.length}</div>
            <div className="roll__note">{state.items.length === 1 ? '1 item' : `${state.items.length} items`}</div>
          </div>
          <div>
            <span className="stage-label">Attempts</span>
            <div className="roll__value">{attempts}</div>
            <div className="roll__note">one per level</div>
          </div>
          <div>
            <span className="stage-label">Target</span>
            <div className="roll__value">20+</div>
            <div className="roll__note">roll + bonus</div>
          </div>
        </div>
      </div>

      {pendingOutcome ? (
        <div className="reading-panel" role="region" aria-label="Read the outcome">
          <span className="stage-label">{pendingOutcome === 'victory' ? 'Victory: read this aloud' : 'Defeat: read this aloud'}</span>
          <p className="reading-panel__text">{outcomeText || 'No text written for this outcome.'}</p>
          <div className="action-row" style={{ marginTop: 0 }}>
            <button className={`s-btn ${pendingOutcome === 'victory' ? 's-btn--success' : 's-btn--danger'}`} onClick={confirm}>
              Reveal to the table <span className="kbd">⏎</span>
            </button>
            <button className="s-btn s-btn--ghost" onClick={() => setPendingOutcome(null)}>
              Cancel <span className="kbd">Esc</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="action-row">
          <span className="stage-hint" style={{ marginLeft: 0 }}>Did the table roll 20 or more?</span>
          <button className="s-btn s-btn--success" onClick={() => setPendingOutcome('victory')}>Victory</button>
          <button className="s-btn s-btn--danger" onClick={() => setPendingOutcome('defeat')}>Defeat</button>
        </div>
      )}
    </>
  )
}
