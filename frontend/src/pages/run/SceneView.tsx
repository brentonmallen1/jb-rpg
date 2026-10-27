import { Fragment, useState } from 'react'
import * as api from '../../hooks/api'
import { useHotkeys } from '../../hooks/useHotkeys'
import type { RunAction } from '../../hooks/useAsyncAction'
import type { GameState, ResolvedContent, Story } from '../../types'
import { BackIcon, EyeOffIcon } from '../../components/Icons'
import { outcomeLabel, OUTCOME_ICON } from '../../lib/outcomes'
import { recap, sceneName } from '../../lib/story'
import { FinaleRoll } from './FinaleRoll'

interface SceneViewProps {
  state: GameState
  resolved: ResolvedContent
  story: Story
  run: RunAction
  pending: boolean
}

const NUMBER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** A running scene. Rendered with key={scene id}, so local state resets per scene. */
export function SceneView({ state, resolved, story, run, pending }: SceneViewProps) {
  const [revealedToMe, setRevealedToMe] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const scene = story.scenes.find(s => s.id === state.current_scene_id)
  const previously = recap(story, state.history.at(-1))
  const choicesVisible = revealedToMe || state.shuffled_indices.length > 0
  const canGoBack = state.history.length > 0 && !story.settings.non_linear

  const revealToMe = () => run(async () => {
    await api.revealChoices(false) // shuffle, but don't show players yet
    setRevealedToMe(true)
  }, 'Failed to reveal choices')
  const dealToTable = () => run(() => api.revealChoices(true), 'Failed to show choices')
  const confirm = () => {
    if (selected === null || pending) return
    run(() => api.makeChoice(selected), 'Failed to make choice')
  }
  const goBack = () => run(api.goBack, 'Failed to go back')

  const choiceCount = scene?.is_finale ? 0 : state.shuffled_indices.length
  useHotkeys({
    r: !choicesVisible && !scene?.is_finale ? revealToMe : undefined,
    s: !scene?.is_finale ? dealToTable : undefined,
    enter: selected !== null ? confirm : undefined,
    escape: selected !== null ? () => setSelected(null) : undefined,
    b: canGoBack ? goBack : undefined,
    ...Object.fromEntries(
      NUMBER_KEYS.slice(0, choicesVisible ? choiceCount : 0).map((key, i) => [key, () => setSelected(i)])
    ),
  })

  if (!scene) return null

  return (
    <article>
      {previously && (
        <p className="recap">
          <span className="stage-label">Previously</span>
          <span className="recap__text">{previously.scene}: you {previously.outcome}.</span>
        </p>
      )}

      {scene.display_name && <div className="eyebrow ink">{scene.display_name}</div>}
      <h1 className="stage-title ink">{scene.title}</h1>
      <p className="scene-text ink ink--late">{resolved.scene_text}</p>

      {scene.is_finale ? (
        <>
          {scene.finale_setup_text && <p className="scene-text">{scene.finale_setup_text}</p>}
          <FinaleRoll state={state} resolved={resolved} run={run} />
        </>
      ) : !choicesVisible ? (
        <div className="action-row">
          <button className="s-btn" onClick={revealToMe}>
            Reveal choices <span className="kbd">R</span>
          </button>
          <span className="stage-hint storyteller-only">Only you will see them until you deal them to the table.</span>
        </div>
      ) : (
        <>
          <div className="section-label stage-label storyteller-only">
            <EyeOffIcon size={16} /> Choices · outcomes are only on your screen
          </div>
          <div className={`choice-list ${selected !== null ? 'choice-list--deciding' : ''}`}>
            {state.shuffled_indices.map((originalIndex, visualIndex) => {
              const choice = scene.choices[originalIndex]
              if (!choice) return null
              const Icon = OUTCOME_ICON[choice.kind]
              const isSelected = selected === visualIndex
              return (
                <Fragment key={visualIndex}>
                  <button
                    className="choice-card"
                    aria-pressed={isSelected}
                    onClick={() => setSelected(isSelected ? null : visualIndex)}
                    style={{ '--i': visualIndex } as React.CSSProperties}
                  >
                    <span className="keycap">{visualIndex + 1}</span>
                    <span className="choice-card__text">{choice.display_text}</span>
                    <span className={`outcome outcome--${choice.kind} storyteller-only`}>
                      <Icon size={16} />{outcomeLabel(choice)}
                    </span>
                  </button>
                  {isSelected && (
                    <div className="reading-panel" role="region" aria-label="Confirm this choice">
                      <span className="stage-label">Read this aloud</span>
                      <p className="reading-panel__text">{choice.result_text}</p>
                      <div className="action-row" style={{ marginTop: 0 }}>
                        <button className="s-btn" onClick={confirm} disabled={pending}>
                          Confirm choice <span className="kbd">⏎</span>
                        </button>
                        <button className="s-btn s-btn--ghost" onClick={() => setSelected(null)}>
                          Cancel <span className="kbd">Esc</span>
                        </button>
                      </div>
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
          <div className="action-row">
            <button className={`s-btn ${state.choices_revealed ? 's-btn--ghost' : ''}`} onClick={dealToTable}>
              {state.choices_revealed ? 'Show choices on phones again' : 'Deal choices to the table'} <span className="kbd">S</span>
            </button>
            <span className="stage-hint storyteller-only">Press 1–{choiceCount} to choose</span>
          </div>
        </>
      )}

      {canGoBack && (
        <div className="action-row storyteller-only">
          <button className="s-btn s-btn--ghost" onClick={goBack}>
            <BackIcon size={16} /> Undo last choice <span className="kbd">B</span>
          </button>
          {previously && <span className="stage-hint" style={{ marginLeft: 0 }}>Returns to {sceneName(story.scenes.find(s => s.id === state.history.at(-1)?.scene_id) ?? scene)}</span>}
        </div>
      )}
    </article>
  )
}
