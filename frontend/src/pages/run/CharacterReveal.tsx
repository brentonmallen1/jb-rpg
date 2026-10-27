import * as api from '../../hooks/api'
import { useHotkeys } from '../../hooks/useHotkeys'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { Character } from '../../types'

interface CharacterRevealProps {
  character: Character
  run: RunAction
}

export function CharacterReveal({ character, run }: CharacterRevealProps) {
  const proceed = () => run(api.proceedFromCharacter, 'Failed to continue')
  useHotkeys({ enter: proceed })

  return (
    <article>
      <div className="eyebrow ink">Read this to the table</div>
      <h1 className="stage-title ink">{character.name}</h1>
      <p className="scene-text ink ink--late">{character.description}</p>
      <div className="action-row">
        <button className="s-btn" onClick={proceed}>
          Begin the story <span className="kbd">⏎</span>
        </button>
      </div>
    </article>
  )
}
