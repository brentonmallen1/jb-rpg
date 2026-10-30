import { useState } from 'react'
import * as api from '../../hooks/api'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useRollPause } from '../../hooks/useRollPause'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, ResolvedContent } from '../../types'
import { D20Icon } from '../../components/Icons'

interface FinaleRollProps {
  state: GameState
  resolved: ResolvedContent | null
  run: RunAction
}

const TARGET = 20
const ORDINAL = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']

/**
 * The d20 roll. Real dice: the table rolls and the storyteller enters each roll as it lands.
 * Or the app's d20: the storyteller rolls it here, or (when players joined by name) hands it to
 * one player, whose phone alone can roll it. Each roll lands on every screen before the next.
 * Either way the rolls decide the outcome and go on the keepsake; the storyteller tells it.
 */
export function FinaleRoll({ state, resolved, run }: FinaleRollProps) {
  const [pendingOutcome, setPendingOutcome] = useState<'victory' | 'defeat' | null>(null)
  const [entry, setEntry] = useState('')
  const rolls = state.final_rolls ?? []
  const bonus = state.items.length
  const attempts = state.level
  const digital = state.roll_offered
  const named = state.turn_mode !== 'storyteller'
  const holder = resolved?.final_roll?.roller ?? null
  const landing = useRollPause(rolls.length)
  // The rolls have decided; the storyteller tells it
  const decided = rolls.length > 0 && state.outcome && !state.outcome_revealed ? state.outcome : null
  const reading = decided ?? pendingOutcome
  const outcomeText = reading === 'victory' ? resolved?.victory_text : resolved?.defeat_text
  const entered = Number(entry)
  const validEntry = Number.isInteger(entered) && entered >= 1 && entered <= 20

  function confirm() {
    if (decided) run(api.revealOutcome, 'Failed to reveal the outcome')
    else if (pendingOutcome) run(() => api.finish(pendingOutcome), 'Failed to finish game')
  }

  function record(e: React.FormEvent) {
    e.preventDefault()
    if (!validEntry) return
    run(() => api.recordRoll(rolls.length, entered), 'Could not enter that roll')
    setEntry('')
  }

  useHotkeys({
    enter: reading ? confirm : undefined,
    escape: pendingOutcome ? () => setPendingOutcome(null) : undefined,
  })

  const undo = !digital && rolls.length > 0 && (
    <button className="s-btn s-btn--ghost" onClick={() => run(api.undoRoll, 'Could not take the roll back')}>
      Undo the last roll
    </button>
  )

  return (
    <>
      <div className="roll">
        <D20Icon size={128} className="d20" />
        <div className="roll__stats">
          <div>
            <span className="stage-label">Bonus</span>
            <div className="roll__value">+{bonus}</div>
            <div className="roll__note">{bonus === 1 ? '1 item' : `${bonus} items`}</div>
          </div>
          <div>
            <span className="stage-label">Attempts</span>
            <div className="roll__value">{attempts}</div>
            <div className="roll__note">one per level</div>
          </div>
          <div>
            <span className="stage-label">Target</span>
            <div className="roll__value">{TARGET}+</div>
            <div className="roll__note">roll + bonus</div>
          </div>
        </div>
      </div>

      {!pendingOutcome && (
        <form className="rolls" aria-label="The rolls" onSubmit={record}>
          <ol className="rolls__slots">
            {Array.from({ length: attempts }, (_, i) => {
              const roll = rolls[i]
              const total = roll === undefined ? null : roll + bonus
              const enough = total !== null && total >= TARGET
              const current = i === rolls.length && !decided
              const unneeded = roll === undefined && !current
              return (
                <li key={i} className={`rolls__slot ${enough ? 'is-enough' : ''} ${unneeded ? 'is-unneeded' : ''}`}>
                  <span className="stage-label">{ORDINAL[i] ?? `Roll ${i + 1}`}</span>
                  {current && !digital ? (
                    <input
                      className="rolls__die rolls__input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      value={entry}
                      onChange={e => setEntry(e.target.value)}
                      aria-label={`${ORDINAL[i] ?? `Roll ${i + 1}`} roll, 1 to 20`}
                      autoFocus
                    />
                  ) : (
                    <span className="rolls__die">{roll ?? ''}</span>
                  )}
                  <span className="rolls__note">
                    {total !== null ? `${total} · ${enough ? 'enough' : 'short'}` : unneeded ? (decided ? 'not needed' : '') : digital ? 'waiting…' : `+${bonus}`}
                  </span>
                </li>
              )
            })}
          </ol>
          {!digital && !decided && (
            <button type="submit" className="s-btn" disabled={!validEntry}>Enter the roll <span className="kbd">⏎</span></button>
          )}
        </form>
      )}

      {reading ? (
        <div className="reading-panel" role="region" aria-label="Read the outcome">
          <span className="stage-label">{reading === 'victory' ? 'Victory: read this aloud' : 'Defeat: read this aloud'}</span>
          <p className="reading-panel__text">{outcomeText || 'No text written for this outcome.'}</p>
          <div className="action-row" style={{ marginTop: 0 }}>
            <button className={`s-btn ${reading === 'victory' ? 's-btn--success' : 's-btn--danger'}`} onClick={confirm}>
              Reveal to the table <span className="kbd">⏎</span>
            </button>
            {!decided && (
              <button className="s-btn s-btn--ghost" onClick={() => setPendingOutcome(null)}>
                Cancel <span className="kbd">Esc</span>
              </button>
            )}
            {decided && undo}
          </div>
        </div>
      ) : digital ? (
        <>
          {named && state.players.length > 0 && (
            <div className="turn-line">
              <span className="turn-line__who">{holder ? <><strong>{holder.name}</strong> holds the die</> : 'Who rolls?'}</span>
              <div className="turn-line__pick storyteller-only" role="group" aria-label="Hand the die to">
                {state.players.map(p => (
                  <button
                    key={p.id}
                    className="chip-btn"
                    aria-pressed={holder?.id === p.id}
                    onClick={() => run(() => api.setRoller(holder?.id === p.id ? null : p.id), 'Could not hand over the die')}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="action-row">
            <span className="stage-hint" style={{ marginLeft: 0 }}>
              {holder ? `${holder.name} taps Roll on their phone.` : named ? 'Hand the die to a player, or roll it here.' : "The app's d20: roll it here."}
            </span>
            <button className={`s-btn ${holder ? 's-btn--ghost' : ''}`} disabled={landing} onClick={() => run(() => api.roll(rolls.length), 'Could not roll')}>
              {landing ? 'Landing…' : 'Roll here'}
            </button>
            {rolls.length === 0 && (
              <button className="s-btn s-btn--ghost" onClick={() => run(() => api.offerRoll(false), 'Could not change the roll')}>
                Use real dice instead
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="action-row">
          <span className="stage-hint" style={{ marginLeft: 0 }}>Real dice: enter each roll as it lands.</span>
          {undo}
          {rolls.length === 0 && (
            <button className="s-btn s-btn--ghost" onClick={() => run(() => api.offerRoll(true), 'Could not send the roll')}>
              {named ? 'Roll on the phones instead' : "Roll the app's d20 instead"}
            </button>
          )}
          <span className="rolls__skip">
            Or skip the numbers:
            <button className="s-btn s-btn--ghost" onClick={() => setPendingOutcome('victory')}>Victory</button>
            <button className="s-btn s-btn--ghost" onClick={() => setPendingOutcome('defeat')}>Defeat</button>
          </span>
        </div>
      )}
    </>
  )
}
