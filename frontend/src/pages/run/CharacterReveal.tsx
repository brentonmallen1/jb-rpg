import { useEffect, useRef, useState } from 'react'
import * as api from '../../hooks/api'
import { useHotkeys } from '../../hooks/useHotkeys'
import type { RunAction } from '../../hooks/useAsyncAction'
import { crestRound } from '../../lib/crest'
import { Crest, EmblemImage } from '../../components'
import type { Character, Emblem, ThemeName } from '../../types'

interface CharacterRevealProps {
  character: Character
  crest: number
  emblem: Emblem | null
  theme: ThemeName
  run: RunAction
}

/**
 * The hero is read to the table, and the table picks a crest from three: emblems from the emblem
 * service in the story's theme, or, when it's down, three drawn here from the hero's answers.
 */
export function CharacterReveal({ character, crest, emblem, theme, run }: CharacterRevealProps) {
  const [round, setRound] = useState(emblem ? 0 : Math.floor(crest / 3))
  // null while loading; 'down' falls back to the built-in crests
  const [options, setOptions] = useState<Emblem[] | 'down' | null>(null)
  const pickFirst = useRef(!emblem)  // the first of a new three is chosen, as the built-in crests do
  const proceed = () => run(api.proceedFromCharacter, 'Failed to continue')
  const choose = (variant: number) => run(() => api.chooseCrest(variant), 'Could not choose that crest')
  const chooseEmblem = (input: string) => run(() => api.chooseEmblem(input), 'Could not choose that crest')
  useHotkeys({ enter: proceed })

  useEffect(() => {
    let live = true
    setOptions(prev => (prev === 'down' ? prev : null))
    api.emblemOptions(round).then(({ emblems }) => {
      if (!live) return
      setOptions(emblems)
      if (pickFirst.current && emblems[0]) chooseEmblem(emblems[0].input)
      pickFirst.current = false
    }).catch(() => {
      if (live) setOptions('down')
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  function another() {
    setRound(round + 1)
    if (options === 'down') choose((round + 1) * 3)
    else pickFirst.current = true
  }

  return (
    <article className="reveal">
      <div>
        <div className="eyebrow ink">Read this to the table</div>
        <h1 className="stage-title ink">{character.name}</h1>
        <p className="scene-text ink ink--late">{character.description}</p>
      </div>

      <section className="crests" aria-label="Choose a crest together">
        <span className="stage-label">Choose a crest together</span>
        <div className="crests__options" aria-busy={options === null}>
          {options === null && [0, 1, 2].map(i => <span key={i} className="crests__option crests__option--loading" aria-hidden="true" />)}
          {Array.isArray(options) && options.map(option => (
            <button
              key={option.input}
              type="button"
              className={`crests__option ${emblem?.input === option.input ? 'is-chosen' : ''}`}
              aria-pressed={emblem?.input === option.input}
              onClick={() => chooseEmblem(option.input)}
              title={option.description}
            >
              <EmblemImage emblem={option} size={96} />
            </button>
          ))}
          {options === 'down' && crestRound(round).map(variant => (
            <button
              key={variant}
              type="button"
              className={`crests__option ${!emblem && crest === variant ? 'is-chosen' : ''}`}
              aria-pressed={!emblem && crest === variant}
              onClick={() => choose(variant)}
            >
              <Crest character={character} variant={variant} theme={theme} size={88} />
            </button>
          ))}
        </div>
        <button type="button" className="s-btn s-btn--ghost crests__more" onClick={another} disabled={options === null}>
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
