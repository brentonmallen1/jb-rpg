import { useCallback, useEffect, useState } from 'react'
import { useGame } from '../context/useGame'
import { Atmosphere, CriticalPulse, HealthMeter, MomentLayer } from '../components'
import { MOODS } from '../lib/themes'
import type { QueuedMoment } from '../hooks/useMoments'
import type { EffectsLevel } from '../hooks/useEffectsLevel'
import type { Moment, MomentType } from '../lib/moments'
import { THEMES, type ThemeName } from '../types'
import '../styles/phone.css'

const SAMPLES: Record<MomentType, Moment> = {
  character_revealed: { type: 'character_revealed', name: 'Bartholomew' },
  hp_lost: { type: 'hp_lost', hp: 1 },
  item_gained: { type: 'item_gained', item: "Elder's Map" },
  level_up: { type: 'level_up', level: 2 },
  scene_changed: { type: 'scene_changed' },
  choices_revealed: { type: 'choices_revealed' },
  decider: { type: 'decider', playerId: 'p1', name: 'Wren' },
  finale: { type: 'finale' },
  victory: { type: 'victory' },
  defeat: { type: 'defeat' },
}

/** Dev-only tuning page: fire each moment in each theme and effects level. */
export default function DevMoments() {
  const { setTheme, theme } = useGame()
  const [level, setLevel] = useState<EffectsLevel>('full')
  const [queue, setQueue] = useState<QueuedMoment[]>([])
  const [nextId, setNextId] = useState(0)
  const [critical, setCritical] = useState(false)
  const [moodIndex, setMoodIndex] = useState(0)
  const moods = MOODS[theme]
  const mood = moods[moodIndex % moods.length].id

  useEffect(() => {
    setTheme('fantasy')
  }, [setTheme])

  function fire(...types: MomentType[]) {
    setQueue(q => [...q, ...types.map((t, i) => ({ ...SAMPLES[t], id: nextId + i }))])
    setNextId(nextId + types.length)
  }
  const done = useCallback((id: number) => setQueue(q => q.filter(m => m.id !== id)), [])

  return (
    <main className="phone" style={{ gap: 'var(--space-lg)' }}>
      <h1>Moments</h1>
      <div className="row gap-sm" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
        <select className="input" value={theme} onChange={e => setTheme(e.target.value as ThemeName)} aria-label="Theme">
          {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input" value={level} onChange={e => setLevel(e.target.value as EffectsLevel)} aria-label="Effects">
          <option value="full">full</option>
          <option value="subtle">subtle</option>
          <option value="off">off</option>
        </select>
        <select className="input" value={mood} onChange={e => setMoodIndex(moods.findIndex(m => m.id === e.target.value))} aria-label="Mood">
          {moods.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <label className="row gap-sm">
          <input type="checkbox" checked={critical} onChange={e => setCritical(e.target.checked)} /> last life
        </label>
      </div>

      <div className="row gap-sm" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
        {(Object.keys(SAMPLES) as MomentType[]).map(t => (
          <button key={t} className="btn btn--secondary" onClick={() => fire(t)}>{t}</button>
        ))}
        <button className="btn" onClick={() => fire('hp_lost', 'scene_changed')}>damage → next scene</button>
        <button className="btn" onClick={() => fire('item_gained', 'finale')}>item → finale</button>
      </div>

      <Atmosphere theme={theme} mood={mood} level={level} madness={critical ? 0.67 : 0.33} />
      <HealthMeter hp={critical ? 1 : 2} max={3} theme={theme} size={36} />
      <div className="dealt" style={{ width: '100%' }}>
        {['Kneel and take the ring?', 'Give voice to the carved words?', 'Arrange the scattered bones?'].map((text, i) => (
          <div key={`${text}-${nextId}`} className="dealt__card" style={{ '--i': i } as React.CSSProperties}>{text}</div>
        ))}
      </div>

      <CriticalPulse active={critical} level={level} />
      <MomentLayer moment={queue[0] ?? null} theme={theme} level={level} onDone={done} />
    </main>
  )
}
