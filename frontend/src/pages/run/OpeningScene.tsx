import * as api from '../../hooks/api'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { OpeningScene as OpeningSceneData } from '../../types'

interface OpeningSceneProps {
  scene: OpeningSceneData
  sceneText: string
  run: RunAction
}

export function OpeningScene({ scene, sceneText, run }: OpeningSceneProps) {
  const choose = (index: number | null) => run(() => api.openingChoice(index), 'Failed to continue')

  return (
    <div className="run-content">
      <h1 className="run-title">{scene.title}</h1>
      <div className="card mb-lg">
        <p className="prose">{sceneText}</p>
      </div>

      {scene.choices.length > 0 ? (
        <div className="btn-group--stack">
          {scene.choices.map((choice, index) => (
            <button key={index} className="btn w-full" onClick={() => choose(index)}>
              {choice.text}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center">
          <button className="btn" onClick={() => choose(null)}>
            Choose Your Path
          </button>
        </div>
      )}
    </div>
  )
}
