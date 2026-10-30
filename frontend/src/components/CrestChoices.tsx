import { crestRound } from '../lib/crest'
import type { GameState, ThemeName } from '../types'
import { Crest, EmblemImage } from './Crest'

export type CrestPick = { variant: number } | { emblem: string }

interface CrestChoicesProps {
  state: GameState
  theme: ThemeName
  size: number
  onChoose: (pick: CrestPick) => void
}

/**
 * The three crests the table is choosing from, the same on the stage and every phone:
 * emblems from the emblem service, or the built-in crests when it's down.
 */
export function CrestChoices({ state, theme, size, onChoose }: CrestChoicesProps) {
  const round = state.crest_round
  if (round === null || !state.character) {
    return (
      <div className="crests__options" aria-busy="true">
        {[0, 1, 2].map(i => <span key={i} className="crests__option crests__option--loading" style={{ width: size + 28, height: size + 28 }} aria-hidden="true" />)}
      </div>
    )
  }
  return (
    <div className="crests__options">
      {state.emblem_options.length > 0
        ? state.emblem_options.map(option => {
            const chosen = state.emblem?.input === option.input
            return (
              <button key={option.input} type="button" className={`crests__option ${chosen ? 'is-chosen' : ''}`} aria-pressed={chosen} title={option.description} onClick={() => onChoose({ emblem: option.input })}>
                <EmblemImage emblem={option} size={size} />
              </button>
            )
          })
        : crestRound(round).map(variant => {
            const chosen = !state.emblem && state.crest === variant
            return (
              <button key={variant} type="button" className={`crests__option ${chosen ? 'is-chosen' : ''}`} aria-pressed={chosen} onClick={() => onChoose({ variant })}>
                <Crest character={state.character!} variant={variant} theme={theme} size={size} />
              </button>
            )
          })}
    </div>
  )
}
