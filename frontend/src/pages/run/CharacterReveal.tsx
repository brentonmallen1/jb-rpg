import { useEffect } from 'react'
import * as api from '../../hooks/api'
import { useHotkeys } from '../../hooks/useHotkeys'
import type { RunAction } from '../../hooks/useAsyncAction'
import { CrestChoices, type CrestPick } from '../../components'
import type { GameState, ThemeName } from '../../types'

interface CharacterRevealProps {
  state: GameState
  theme: ThemeName
  run: RunAction
}

/**
 * The hero is read to the table, and the table picks a crest from three, shown here and on
 * every phone (where any player can choose): emblems from the emblem service in the story's
 * theme, or, when it's down, three drawn from the hero's answers.
 */
export function CharacterReveal({ state, theme, run }: CharacterRevealProps) {
  const character = state.character!
  const round = state.crest_round
  const proceed = () => run(api.proceedFromCharacter, 'Failed to continue')
  const choose = (pick: CrestPick) => run(
    () => ('emblem' in pick ? api.chooseEmblem(pick.emblem) : api.chooseCrest(pick.variant)),
    'Could not choose that crest',
  )
  useHotkeys({ enter: proceed })

  // The first three, once, for everyone
  useEffect(() => {
    if (round === null) run(() => api.crestOptions(0), 'Could not find crests')
  }, [round, run])

  return (
    <article className="reveal">
      <div>
        <div className="eyebrow ink">Read this to the table</div>
        <h1 className="stage-title ink">{character.name}</h1>
        <p className="scene-text ink ink--late">{character.description}</p>
      </div>

      <section className="crests" aria-label="Choose a crest together">
        <span className="stage-label">Choose a crest together</span>
        <CrestChoices state={state} theme={theme} size={96} onChoose={choose} />
        <button type="button" className="s-btn s-btn--ghost crests__more" disabled={round === null} onClick={() => run(() => api.crestOptions((round ?? 0) + 1), 'Could not find crests')}>
          Another three
        </button>
      </section>

      <div className="action-row">
        <button className="s-btn" onClick={proceed}>
          Begin the story <span className="kbd">⏎</span>
        </button>
      </div>
    </article>
  )
}
