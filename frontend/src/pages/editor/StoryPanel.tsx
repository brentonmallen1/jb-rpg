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
  const errors = problems.filter(p => p.severity === 'error')
  const warnings = problems.filter(p => p.severity === 'warning')
  const hp = story.settings.starting_hp
  const setHp = (value: number) => update(s => ({ ...s, settings: { ...s.settings, starting_hp: Math.min(10, Math.max(1, value)) } }))

  return (
    <div className="ed-panel">
      <div className="ed-panel__head">
        <span className="stage-label">Story settings</span>
      </div>
      <input
        className="ed-title-input"
        aria-label="Story title"
        value={story.title}
        onChange={e => update(s => ({ ...s, title: e.target.value }))}
      />

      {errors.length === 0 ? (
        <p className="ed-ready">Ready to play.</p>
      ) : (
        <Section title={`Before it can be played (${errors.length})`}>
          <ProblemLinks problems={errors} story={story} onJump={onJump} />
        </Section>
      )}
      {warnings.length > 0 && (
        <Section title={`Worth a look (${warnings.length})`}>
          <p className="ed-muted">These won't stop a game, but they may not be what you meant.</p>
          <ProblemLinks problems={warnings} story={story} onJump={onJump} quiet />
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
              ? 'The party picks which door comes next; the finale unlocks once no other door can be opened. A choice can also lead to a room behind a door.'
              : 'Scenes play down the list unless a choice or a route leads somewhere else; every path ends at a finale or The end.'}
          </p>
        </Field>
      </div>

      <Field label="Voting time" hint="when the table votes on each choice" htmlFor="vote-seconds">
        <select
          id="vote-seconds"
          className="ed-input"
          style={{ maxWidth: 260 }}
          value={story.settings.vote_seconds ?? 60}
          onChange={e => update(s => ({ ...s, settings: { ...s.settings, vote_seconds: Number(e.target.value) } }))}
        >
          {[30, 45, 60, 90, 120, 180].map(n => <option key={n} value={n}>{n % 60 ? `${n} seconds` : n === 60 ? '1 minute' : `${n / 60} minutes`}</option>)}
          <option value={0}>No time limit</option>
        </select>
      </Field>

      <SoundSection story={story} audio={audio} onAudioChange={onAudioChange} update={update} />
    </div>
  )
}

function ProblemLinks({ problems, story, onJump, quiet }: { problems: StoryProblem[]; story: Story; onJump: (selection: EditorSelection) => void; quiet?: boolean }) {
  return (
    <ul className={`ed-problems ed-problems--links ${quiet ? 'ed-problems--quiet' : ''}`}>
      {problems.map(p => (
        <li key={p.message}>
          <button
            type="button"
            onClick={() => onJump(
              p.area === 'scene' && p.scene_id ? { kind: 'scene', id: p.scene_id } :
              p.area === 'items' ? { kind: 'items', id: p.index !== null ? story.items?.[p.index]?.id : undefined } :
              p.area === 'opening' ? { kind: 'opening' } :
              p.area === 'characters' ? { kind: 'characters' } : { kind: 'story' }
            )}
          >
            {p.message}
          </button>
        </li>
      ))}
    </ul>
  )
}
