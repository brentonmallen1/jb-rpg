import { THEMES, type AudioFile, type Story, type StoryProblem } from '../../types'
import { HEALTH_LABEL } from '../../lib/themes'
import { Field, Section } from './fields'
import type { EditorSelection } from './EditorNav'
import { SoundSection } from './SoundSection'

const THEME_LABEL: Record<string, string> = {
  cyberpunk: 'Cyberpunk', fantasy: 'Fantasy', deep_space: 'Deep Space', modern: 'Modern', horror: 'Horror', insanity: 'Insanity',
}

interface StoryPanelProps {
  story: Story
  problems: StoryProblem[]
  update: (change: (story: Story) => Story) => void
  onJump: (selection: EditorSelection) => void
  audio: AudioFile[]
  onAudioChange: () => void
}

export function StoryPanel({ story, problems, update, onJump, audio, onAudioChange }: StoryPanelProps) {
  const hp = story.settings.starting_hp
  const setHp = (value: number) => update(s => ({ ...s, settings: { ...s.settings, starting_hp: Math.min(10, Math.max(1, value)) } }))

  return (
    <div className="ed-panel">
      <div className="ed-panel__head">
        <span className="stage-label">The story</span>
      </div>
      <input
        className="ed-title-input"
        aria-label="Story title"
        value={story.title}
        onChange={e => update(s => ({ ...s, title: e.target.value }))}
      />

      {problems.length === 0 ? (
        <p className="ed-ready">Ready to play.</p>
      ) : (
        <Section title={`Before it can be played (${problems.length})`}>
          <ul className="ed-problems ed-problems--links">
            {problems.map(p => (
              <li key={p.message}>
                <button
                  type="button"
                  onClick={() => onJump(
                    p.area === 'scene' && p.scene_id ? { kind: 'scene', id: p.scene_id } :
                    p.area === 'opening' ? { kind: 'opening' } :
                    p.area === 'characters' ? { kind: 'characters' } : { kind: 'story' }
                  )}
                >
                  {p.message}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Theme">
        <div className="ed-themes" role="radiogroup" aria-label="Theme">
          {THEMES.map(theme => (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={story.theme === theme}
              className={`ed-theme cover ${theme}`}
              onClick={() => update(s => ({ ...s, theme }))}
            >
              <span className="cover__art" aria-hidden="true" />
              <span className="ed-theme__name">{THEME_LABEL[theme]}</span>
              <span className="ed-theme__sample">{story.title || 'Untitled'}</span>
            </button>
          ))}
        </div>
      </Section>

      <div className="ed-grid-2">
        <Field label={`Starting ${HEALTH_LABEL[story.theme].toLowerCase()}`} hint="how many lives the party has">
          <div className="ed-stepper">
            <button type="button" className="icon-btn" aria-label="Fewer" onClick={() => setHp(hp - 1)} disabled={hp <= 1}>−</button>
            <output aria-live="polite">{hp}</output>
            <button type="button" className="icon-btn" aria-label="More" onClick={() => setHp(hp + 1)} disabled={hp >= 10}>+</button>
          </div>
        </Field>

        <Field label="Story shape">
          <div className="ed-segmented" role="radiogroup" aria-label="Story shape">
            <button type="button" role="radio" aria-checked={!story.settings.non_linear}
              onClick={() => update(s => ({ ...s, settings: { ...s.settings, non_linear: false } }))}>
              One path
            </button>
            <button type="button" role="radio" aria-checked={story.settings.non_linear}
              onClick={() => update(s => ({ ...s, settings: { ...s.settings, non_linear: true } }))}>
              Choose doors
            </button>
          </div>
          <p className="ed-muted" style={{ marginTop: 6 }}>
            {story.settings.non_linear
              ? 'The party picks which scene comes next; the finale unlocks once every other door is open.'
              : 'Scenes play in order; the last one ends in the final roll.'}
          </p>
        </Field>
      </div>

      <SoundSection story={story} audio={audio} onAudioChange={onAudioChange} update={update} />
    </div>
  )
}
