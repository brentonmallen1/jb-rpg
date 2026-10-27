import type { GameState } from '../../types'
import { HPDisplay } from '../../components'
import { GemIcon } from '../../components/Icons'

/** The party's state, always in view beside the scene. */
export function PartyRail({ state, characterDescription }: { state: GameState; characterDescription?: string }) {
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
        <span className="stage-label">Health</span>
        <div style={{ marginTop: 8 }}>
          <HPDisplay hp={state.hp} />
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
