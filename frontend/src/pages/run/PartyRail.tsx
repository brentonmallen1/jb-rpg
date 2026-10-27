import type { GameState, ThemeName } from '../../types'
import { HealthMeter } from '../../components'
import { HEALTH_LABEL } from '../../lib/themes'
import { GemIcon } from '../../components/Icons'

interface PartyRailProps {
  state: GameState
  theme: ThemeName
  maxHp: number
  characterDescription?: string
}

/** The party's state, always in view beside the scene. */
export function PartyRail({ state, theme, maxHp, characterDescription }: PartyRailProps) {
  return (
    <aside className="party" aria-label="Party">
      {state.character && (
        <div>
          <span className="stage-label">The hero</span>
          <div className="party__name">{state.character.name}</div>
          {characterDescription && <p className="party__desc">{characterDescription}</p>}
        </div>
      )}

      <div>
        <span className="stage-label">{HEALTH_LABEL[theme]}</span>
        <div style={{ marginTop: 10 }}>
          <HealthMeter hp={state.hp} max={maxHp} theme={theme} size={30} />
        </div>
      </div>

      <div className="party__stats">
        <div>
          <span className="stage-label">Level</span>
          <div className="party__stat-value">{state.level}</div>
        </div>
        <div>
          <span className="stage-label">Final roll</span>
          <div className="party__stat-value">d20+{state.items.length}</div>
        </div>
      </div>

      <div>
        <span className="stage-label">Items</span>
        {state.items.length > 0 ? (
          <ul className="party__items">
            {state.items.map((item, i) => (
              <li key={`${item}-${i}`}><GemIcon size={16} />{item}</li>
            ))}
          </ul>
        ) : (
          <p className="party__desc">Nothing yet.</p>
        )}
      </div>
    </aside>
  )
}
