import { useState } from 'react'
import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, ResolvedContent } from '../../types'
import { FinaleRollInfo, Modal } from '../../components'

interface FinaleRollProps {
  state: GameState
  resolved: ResolvedContent | null
  run: RunAction
  infoClassName?: string
}

/** The d20 roll: storyteller records the physical roll, reads the outcome text, then finishes. */
export function FinaleRoll({ state, resolved, run, infoClassName }: FinaleRollProps) {
  const [pendingOutcome, setPendingOutcome] = useState<'victory' | 'defeat' | null>(null)
  const outcomeText = pendingOutcome === 'victory' ? resolved?.victory_text : resolved?.defeat_text

  async function confirm() {
    if (!pendingOutcome) return
    if (await run(() => api.finish(pendingOutcome), 'Failed to finish game')) {
      setPendingOutcome(null)
    }
  }

  return (
    <>
      <FinaleRollInfo items={state.items.length} level={state.level} className={infoClassName} />
      <div className="btn-group">
        <button className="btn btn--success" onClick={() => setPendingOutcome('victory')}>
          Victory!
        </button>
        <button className="btn btn--danger" onClick={() => setPendingOutcome('defeat')}>
          Defeat
        </button>
      </div>

      <Modal
        isOpen={!!pendingOutcome}
        onClose={() => setPendingOutcome(null)}
        title={pendingOutcome === 'victory' ? 'Victory!' : 'Defeat'}
      >
        <div className="mb-lg">
          {outcomeText ? (
            <p className="prose">{outcomeText}</p>
          ) : (
            <p className="text-secondary">No text provided for this outcome.</p>
          )}
        </div>
        <p className="text-secondary text-sm mb-lg">
          Read the text above to your players, then click Continue.
        </p>
        <div className="btn-group">
          <button className="btn btn--secondary" onClick={() => setPendingOutcome(null)}>
            Cancel
          </button>
          <button className={pendingOutcome === 'victory' ? 'btn btn--success' : 'btn btn--danger'} onClick={confirm}>
            Continue
          </button>
        </div>
      </Modal>
    </>
  )
}
