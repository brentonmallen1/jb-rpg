import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { GameState, Scene, Story } from '../../types'
import { Atmosphere, HealthMeter } from '../../components'
import { D20Icon } from '../../components/Icons'
import { choiceWithItem, fillSample } from '../../lib/storyEdit'
import { outcomeLabel } from '../../lib/outcomes'
import { ChoiceOutcomeIcon } from '../../components/ItemIcon'
import { HEALTH_LABEL, moodFor, moodSeed } from '../../lib/themes'
import { PartyRail } from '../run/PartyRail'
import type { EditorSelection } from './EditorNav'

type Mode = 'stage' | 'phone'
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
const STAGE_WIDTH = 960
const PHONE_WIDTH = 390

interface PreviewPaneProps {
  story: Story
  selection: EditorSelection
  samples: Record<string, string>
  colorMode: 'light' | 'dark'
}

/** The selected scene as the table will see it: on the storyteller's stage or a player's phone. */
export function PreviewPane({ story, selection, samples, colorMode }: PreviewPaneProps) {
  const [mode, setMode] = useState<Mode>('stage')
  const [withItems, setWithItems] = useState(false)
  const scene = selection.kind === 'scene' ? story.scenes.find(s => s.id === selection.id) : undefined
  const fill = (text: string) => fillSample(text, samples)
  const characterName = samples.name?.trim() || (story.madlib_template.fields[0] ? fill(`{${story.madlib_template.fields[0].key}}`) : 'The hero')

  return (
    <aside className="ed-preview" aria-label="Preview">
      <div className="ed-preview__bar">
        <div className="ed-segmented ed-segmented--small" role="radiogroup" aria-label="Preview as">
          <button type="button" role="radio" aria-checked={mode === 'stage'} onClick={() => setMode('stage')}>Storyteller</button>
          <button type="button" role="radio" aria-checked={mode === 'phone'} onClick={() => setMode('phone')}>Phone</button>
        </div>
        {scene?.is_finale && Object.keys(scene.item_texts ?? {}).length > 0 && (
          <label className="ed-preview__toggle">
            <input type="checkbox" checked={withItems} onChange={e => setWithItems(e.target.checked)} /> items found
          </label>
        )}
      </div>

      <ScaledFrame width={mode === 'stage' ? STAGE_WIDTH : PHONE_WIDTH} key={mode}>
        <div className={`ed-preview__surface ${story.theme}`} data-mode={colorMode} inert>
          {mode === 'stage'
            ? <StagePreview story={story} selection={selection} scene={scene} fill={fill} characterName={characterName} withItems={withItems} />
            : <PhonePreview story={story} selection={selection} scene={scene} fill={fill} characterName={characterName} />}
        </div>
      </ScaledFrame>
      <p className="ed-preview__note">Sample answers fill the blanks: set them under Characters.</p>
    </aside>
  )
}

/** Renders children at a fixed width, scaled down to fit the pane. */
function ScaledFrame({ width, children }: { width: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return
      const s = Math.min(1, outer.current.clientWidth / width)
      setScale(s)
      setHeight(inner.current.offsetHeight * s)
    }
    const observer = new ResizeObserver(measure)
    if (outer.current) observer.observe(outer.current)
    if (inner.current) observer.observe(inner.current)
    measure()
    return () => observer.disconnect()
  }, [width])

  return (
    <div ref={outer} className="ed-preview__frame" style={{ height }}>
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        {children}
      </div>
    </div>
  )
}

interface ViewProps {
  story: Story
  selection: EditorSelection
  scene?: Scene
  fill: (text: string) => string
  characterName: string
}

function fakeState(story: Story, characterName: string, description: string): GameState {
  return {
    session_id: '', story_id: story.id, status: 'running', madlib_step: 0, madlib_answers: {},
    current_scene_id: '', hp: story.settings.starting_hp, level: 1, items: [], history: [],
    character: { name: characterName, description, fields: {} },
    outcome_revealed: false, choices_revealed: false, shuffled_indices: [], turn_mode: 'storyteller', players: [], no_flashing: false, crest: 0, emblem: null, crest_round: null, emblem_options: [], roll_offered: false, final_rolls: [],
  }
}

function StagePreview({ story, selection, scene, fill, characterName, withItems }: ViewProps & { withItems: boolean }) {
  const description = fill(story.madlib_template.prompt)
  const mood = moodFor(story.theme, scene?.mood, scene ? moodSeed(scene.id) : 0)
  let main: ReactNode

  if (selection.kind === 'characters') {
    main = (
      <>
        <div className="eyebrow">Read this to the table</div>
        <h1 className="stage-title">{characterName}</h1>
        <p className="scene-text">{description || 'Write the hero’s description under Characters.'}</p>
      </>
    )
  } else if (selection.kind === 'opening' && story.opening_scene) {
    main = (
      <>
        <div className="eyebrow">Prologue</div>
        <h1 className="stage-title">{story.opening_scene.title}</h1>
        <p className="scene-text">{fill(story.opening_scene.base_text)}</p>
        <div className="choice-list">
          {story.opening_scene.choices.map((c, i) => (
            <div key={i} className="choice-card" style={{ '--i': i } as React.CSSProperties}>
              <span className="keycap">{i + 1}</span><span className="choice-card__text">{fill(c.text)}</span><span />
            </div>
          ))}
        </div>
      </>
    )
  } else if (scene) {
    const items = { story, texts: scene.item_texts, collected: withItems }
    main = (
      <>
        {scene.display_name && <div className="eyebrow">{fill(scene.display_name)}</div>}
        <h1 className="stage-title">{scene.title}</h1>
        <p className="scene-text">{fill(scene.base_text) || 'The scene text appears here.'}</p>
        {scene.is_finale ? (
          <>
            {scene.finale_setup_text && <p className="scene-text">{fill(scene.finale_setup_text)}</p>}
            <div className="roll"><D20Icon size={110} /><div className="roll__stats">
              <div><span className="stage-label">Bonus</span><div className="roll__value">+{withItems ? 2 : 0}</div></div>
              <div><span className="stage-label">Attempts</span><div className="roll__value">1</div></div>
              <div><span className="stage-label">Target</span><div className="roll__value">20+</div></div>
            </div></div>
            <div className="reading-panel"><span className="stage-label">Victory: read this aloud</span>
              <p className="reading-panel__text">{fillSample(scene.victory_text ?? '', {}, { ...items, outcome: 'victory' }) || '…'}</p></div>
            <div className="reading-panel"><span className="stage-label">Defeat: read this aloud</span>
              <p className="reading-panel__text">{fillSample(scene.defeat_text ?? '', {}, { ...items, outcome: 'defeat' }) || '…'}</p></div>
          </>
        ) : (
          <div className="choice-list">
            {scene.choices.map((choice, i) => {
              const c = choiceWithItem(story, choice)
              return (
                <div key={i} className="choice-card" style={{ '--i': i } as React.CSSProperties}>
                  <span className="keycap">{i + 1}</span>
                  <span className="choice-card__text">{fill(c.display_text) || 'Do you…?'}</span>
                  <span className={`outcome outcome--${c.kind}`}><ChoiceOutcomeIcon choice={c} theme={story.theme} />{outcomeLabel(c)}</span>
                </div>
              )
            })}
          </div>
        )}
        {scene.conditional_text.length > 0 && (
          <p className="stage-hint" style={{ marginLeft: 0, marginTop: 16 }}>
            + {scene.conditional_text.length} conditional passage{scene.conditional_text.length === 1 ? '' : 's'} added when {scene.conditional_text.length === 1 ? 'its condition holds' : 'their conditions hold'}
          </p>
        )}
      </>
    )
  } else {
    const first = story.scenes[0]
    main = (
      <>
        <div className="eyebrow">Choose tonight’s adventure</div>
        <h1 className="stage-title">{story.title}</h1>
        <p className="scene-text">{first ? fill(first.base_text) : 'Add a scene to begin.'}</p>
      </>
    )
  }

  const showParty = selection.kind === 'scene' || selection.kind === 'opening'
  return (
    <div className="stage ed-preview__stage">
      <Atmosphere contained theme={story.theme} mood={mood} level="subtle" />
      <header className="stage__bar"><span className="stage__story-title">{story.title}</span></header>
      <div className={`stage__body ${showParty ? '' : 'stage__body--solo'}`}>
        {showParty && <PartyRail state={fakeState(story, characterName, description)} theme={story.theme} maxHp={story.settings.starting_hp} characterDescription={description} />}
        <main className="stage__main">{main}</main>
      </div>
    </div>
  )
}

function PhonePreview({ story, selection, scene, fill, characterName }: ViewProps) {
  const mood = moodFor(story.theme, scene?.mood, scene ? moodSeed(scene.id) : 0)
  let main: ReactNode

  if (selection.kind === 'characters') {
    const first = story.madlib_template.fields[0]
    main = (
      <div className="phone__main--center" style={{ minHeight: 600, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
        <div className="phone-eyebrow">Creating your hero</div>
        <h1 className="phone-question">{first?.label || 'Your first question appears here.'}</h1>
        <p className="phone-text">Call out your answer to the storyteller.</p>
      </div>
    )
  } else {
    const title = selection.kind === 'opening' ? story.opening_scene?.title : scene?.title ?? story.title
    const eyebrow = selection.kind === 'opening' ? 'Prologue' : scene?.is_finale ? 'The end has come' : scene?.display_name ? fill(scene.display_name) : 'Now'
    main = (
      <>
        <div className="phone-eyebrow">{eyebrow}</div>
        <h1 className="phone-title">{scene?.is_finale ? 'The final roll' : title}</h1>
        <div className="party-strip">
          <div>
            <div className="phone-label">{HEALTH_LABEL[story.theme]}</div>
            <div style={{ marginTop: 8 }}><HealthMeter hp={story.settings.starting_hp} max={story.settings.starting_hp} theme={story.theme} size={26} /></div>
          </div>
          <div className="party-strip__stats">
            <div><div className="phone-label">Level</div><div className="party-strip__value">1</div></div>
            <div><div className="phone-label">Items</div><div className="party-strip__value">0</div></div>
          </div>
        </div>
        <div className="hero-chip"><span className="hero-chip__name">{characterName}</span><span className="hero-chip__desc">{fill(story.madlib_template.prompt)}</span></div>
        {scene?.is_finale ? (
          <div className="phone-roll"><D20Icon size={120} /></div>
        ) : scene && (
          <div className="dealt">
            <span className="phone-label">The choices</span>
            {scene.choices.map((c, i) => (
              <div key={i} className="dealt__card" style={{ '--i': i } as React.CSSProperties}>
                <span className="dealt__numeral">{ROMAN[i] ?? i + 1}</span><span>{fill(c.display_text) || 'Do you…?'}</span>
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  return (
    <div className="phone ed-preview__phone">
      <Atmosphere contained theme={story.theme} mood={mood} level="subtle" />
      <header className="phone__bar"><span className="phone__story">{story.title}</span></header>
      <main className="phone__main">{main}</main>
    </div>
  )
}
