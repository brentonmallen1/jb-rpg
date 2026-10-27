import * as api from '../../hooks/api'
import { useHotkeys } from '../../hooks/useHotkeys'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { OpeningScene as OpeningSceneData } from '../../types'

interface OpeningSceneProps {
  scene: OpeningSceneData
  sceneText: string
  run: RunAction
}

export function OpeningScene({ scene, sceneText, run }: OpeningSceneProps) {
  const choose = (index: number | null) => run(() => api.openingChoice(index), 'Failed to continue')

  useHotkeys(
    scene.choices.length > 0
      ? Object.fromEntries(scene.choices.map((_, i) => [String(i + 1), () => choose(i)]))
      : { enter: () => choose(null) }
  )

  return (
    <article>
      <div className="eyebrow ink">Prologue</div>
      <h1 className="stage-title ink">{scene.title}</h1>
      <p className="scene-text ink ink--late">{sceneText}</p>

      {scene.choices.length > 0 ? (
        <div className="choice-list">
          {scene.choices.map((choice, index) => (
            <button
              key={index}
              className="choice-card"
              onClick={() => choose(index)}
              style={{ '--i': index } as React.CSSProperties}
            >
              <span className="keycap">{index + 1}</span>
              <span className="choice-card__text">{choice.text}</span>
              <span />
            </button>
          ))}
        </div>
      ) : (
        <div className="action-row">
          <button className="s-btn" onClick={() => choose(null)}>
            Choose your path <span className="kbd">⏎</span>
          </button>
        </div>
      )}
    </article>
  )
}
