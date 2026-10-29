import type { GameState, PlayerRef, ThemeName } from '../../types'
import { Crest, HealthMeter } from '../../components'
import { HEALTH_LABEL } from '../../lib/themes'
import { CloseIcon } from '../../components/Icons'
import { ItemIcon } from '../../components/ItemIcon'

interface PartyRailProps {
  state: GameState
  theme: ThemeName
  maxHp: number
  characterDescription?: string
  /** Turn-taking games: who's at the table */
  decider?: PlayerRef | null
  playersOnline?: string[]
  onRemovePlayer?: (player: PlayerRef) => void
  votedIds?: string[]
}

/** The party's state, always in view beside the scene. */
export function PartyRail({ state, theme, maxHp, characterDescription, decider, playersOnline = [], onRemovePlayer, votedIds }: PartyRailProps) {
  // Each item's icon is recorded with the choice that found it
  const found = state.history.filter(entry => entry.outcome === 'item' && entry.item_name)
  return (
    <aside className="party" aria-label="Party">
      {state.character && (
        <div>
          <span className="stage-label">The hero</span>
          <div className="party__hero">
            <Crest character={state.character} variant={state.crest} theme={theme} size={48} />
            <div className="party__name">{state.character.name}</div>
          </div>
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

      {state.turn_mode !== 'storyteller' && (
        <div>
          <span className="stage-label">At the table</span>
          {state.players.length === 0 ? (
            <p className="party__desc">Players join with their name from the invite link.</p>
          ) : (
            <ul className="party__players">
              {state.players.map(p => (
                <li key={p.id} className={decider?.id === p.id ? 'is-deciding' : ''}>
                  <span className={`party__online ${playersOnline.includes(p.id) ? 'is-online' : ''}`} title={playersOnline.includes(p.id) ? 'Connected' : 'Not connected'} />
                  <span className="party__player-name">{p.name}</span>
                  {decider?.id === p.id && <span className="party__deciding">deciding</span>}
                  {votedIds?.includes(p.id) && <span className="party__deciding">voted</span>}
                  {onRemovePlayer && (
                    <button className="icon-btn party__remove storyteller-only" onClick={() => onRemovePlayer(p)} aria-label={`Remove ${p.name} from the table`}>
                      <CloseIcon size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <span className="stage-label">Items</span>
        {state.items.length > 0 ? (
          <ul className="party__items">
            {state.items.map((item, i) => (
              <li key={`${item}-${i}`}><ItemIcon name={item} icon={found[i]?.item_icon} theme={theme} size={28} framed />{item}</li>
            ))}
          </ul>
        ) : (
          <p className="party__desc">Nothing yet.</p>
        )}
      </div>
    </aside>
  )
}
