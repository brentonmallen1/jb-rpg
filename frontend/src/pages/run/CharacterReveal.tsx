import { useState } from 'react'
import * as api from '../../hooks/api'
import { useHotkeys } from '../../hooks/useHotkeys'
import type { RunAction } from '../../hooks/useAsyncAction'
import { crestRound } from '../../lib/crest'
import { Crest } from '../../components'
import type { Character, ThemeName } from '../../types'

interface CharacterRevealProps {
  character: Character
  crest: number
  theme: ThemeName
  run: RunAction
}

/** The hero is read to the table, and the table picks a crest from three drawn from its answers. */
export function CharacterReveal({ character, crest, theme, run }: CharacterRevealProps) {
  const [round, setRound] = useState(Math.floor(crest / 3))
  const proceed = () => run(api.proceedFromCharacter, 'Failed to continue')
  const choose = (variant: number) => run(() => api.chooseCrest(variant), 'Could not choose that crest')
  useHotkeys({ enter: proceed })

  return (
    <article className="reveal">
      <div>
        <div className="eyebrow ink">Read this to the table</div>
        <h1 className="stage-title ink">{character.name}</h1>
        <p className="scene-text ink ink--late">{character.description}</p>
      </div>

      <section className="crests" aria-label="Choose a crest together">
        <span className="stage-label">Choose a crest together</span>
        <div className="crests__options">
          {crestRound(round).map(variant => (
            <button
              key={variant}
              type="button"
              className={`crests__option ${crest === variant ? 'is-chosen' : ''}`}
              aria-pressed={crest === variant}
              onClick={() => choose(variant)}
            >
              <Crest character={character} variant={variant} theme={theme} size={88} />
            </button>
          ))}
        </div>
        <button type="button" className="s-btn s-btn--ghost crests__more" onClick={() => {
          setRound(round + 1)
          choose((round + 1) * 3)
        }}>
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
