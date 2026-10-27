import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { Character } from '../../types'
import { ContentBox } from '../../components'

interface CharacterRevealProps {
  character: Character
  run: RunAction
}

export function CharacterReveal({ character, run }: CharacterRevealProps) {
  return (
    <ContentBox width="narrow" centered>
      <h1 className="mb-lg">Read to Players</h1>
      <div className="card mb-lg text-left">
        <div className="font-semibold" style={{ marginBottom: 'var(--space-sm)', fontSize: 'var(--text-xl)' }}>
          {character.name}
        </div>
        <p className="prose">{character.description}</p>
      </div>
      <button className="btn" onClick={() => run(api.proceedFromCharacter, 'Failed to continue')}>
        Continue
      </button>
    </ContentBox>
  )
}
