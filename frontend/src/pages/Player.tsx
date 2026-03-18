import { useState } from 'react'
import { useGame } from '../context/GameContext'

export default function Player() {
  const { state, resolved, toggleColorMode, connectedCount, storytellerConnected } = useGame()
  const [showRules, setShowRules] = useState(false)
  const [showCharacterModal, setShowCharacterModal] = useState(false)

  // Waiting for session to start
  if (!state) {
    return (
      <>
        <Toolbar onToggleMode={toggleColorMode} onShowRules={() => setShowRules(true)} />
        <div className="player-layout" style={playerLayoutStyle}>
          <div className="waiting-state">
            <p>Waiting for storyteller to start...</p>
          </div>
        </div>
        {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      </>
    )
  }

  // Character creation phase
  if (state.status === 'madlib_in_progress') {
    return (
      <>
        <Toolbar onToggleMode={toggleColorMode} onShowRules={() => setShowRules(true)} />
        <div className="player-layout" style={playerLayoutStyle}>
          <div className="creation-header" style={{ marginBottom: 'var(--space-xl)', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-md)' }}>Character Creation</h1>
            <p className="waiting-message" style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              The storyteller is gathering character details...
            </p>
          </div>
          <div className="creation-footer" style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
            <p className="creation-message" style={{ fontSize: '1.5rem', color: 'var(--accent)', fontWeight: 600 }}>
              Your character is being created!
            </p>
          </div>
        </div>
        {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      </>
    )
  }

  // Game over
  if (state.status === 'game_over') {
    return (
      <>
        <Toolbar onToggleMode={toggleColorMode} onShowRules={() => setShowRules(true)} />
        <div className="player-layout" style={playerLayoutStyle}>
          {state.outcome ? (
            <div className="finale-section" style={{ textAlign: 'center' }}>
              <div
                className={`finale-outcome finale-outcome--${state.outcome}`}
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 'bold',
                  marginBottom: 'var(--space-lg)',
                  color: state.outcome === 'victory' ? 'var(--success)' : 'var(--danger)'
                }}
              >
                {state.outcome === 'victory' ? 'VICTORY!' : 'DEFEAT'}
              </div>
              <div className="finale-stats" style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-xl)', marginBottom: 'var(--space-md)' }}>
                <div className="finale-stat" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent)' }}>{state.level}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Level</div>
                </div>
                <div className="finale-stat" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent)' }}>{state.items.length}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Items</div>
                </div>
              </div>
              {state.items.length > 0 && (
                <div className="finale-items" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {state.items.join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ marginBottom: 'var(--space-md)' }}>Final Showdown!</h2>
              <p style={{ color: 'var(--text-secondary)' }}>Waiting for the dice roll...</p>
              <div className="finale-roll-info" style={{
                background: 'var(--bg-secondary)',
                padding: 'var(--space-lg)',
                borderRadius: 'var(--radius-md)',
                marginTop: 'var(--space-lg)',
                lineHeight: 1.8
              }}>
                <p>Roll a d20 + {state.items.length} (items)</p>
                <p>You have {state.level} attempt(s)</p>
                <p>Need 20+ to win!</p>
              </div>
            </div>
          )}
        </div>
        {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      </>
    )
  }

  // Running game
  return (
    <>
      <Toolbar onToggleMode={toggleColorMode} onShowRules={() => setShowRules(true)} />
      <div className="player-layout" style={playerLayoutStyle}>
        {/* Character section */}
        {state.character && (
          <div
            className="character-section"
            style={{
              cursor: 'pointer',
              marginBottom: 'var(--space-lg)',
              padding: 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              transition: 'background 0.2s'
            }}
            onClick={() => setShowCharacterModal(true)}
          >
            <div className="character-name" style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: 'var(--space-sm)' }}>
              {state.character.name}
            </div>
            <div className="character-description-preview" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, maxWidth: '400px' }}>
              {state.character.description.slice(0, 100)}...
            </div>
          </div>
        )}

        {/* HP Display */}
        <div className="hp-section" style={{ marginBottom: 'var(--space-xl)', textAlign: 'center' }}>
          <div className="hp-label" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Health
          </div>
          <div className="hp-display" style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-md)' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={`hp-indicator ${i < state.hp ? 'hp-indicator--full' : 'hp-indicator--empty'}`}
                style={{ width: '48px', height: '48px', fontSize: '2rem' }}
              />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="stats" style={{ display: 'flex', gap: 'var(--space-xl)', marginBottom: 'var(--space-xl)' }}>
          <div className="stat-block" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>{state.level}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Level</div>
          </div>
          <div className="stat-block" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>{state.items.length}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Items</div>
          </div>
        </div>

        {/* Items list */}
        {state.items.length > 0 && (
          <ul className="items-list" style={{ listStyle: 'none', marginBottom: 'var(--space-xl)', maxWidth: '300px' }}>
            {state.items.map((item, i) => (
              <li key={i} style={{ padding: 'var(--space-sm)', borderBottom: '1px solid var(--bg-secondary)' }}>
                {item}
              </li>
            ))}
          </ul>
        )}

        {/* Revealed choices */}
        {state.choices_revealed && resolved?.choices && (
          <div className="revealed-choices" style={{ marginTop: 'var(--space-lg)', width: '100%', maxWidth: '400px' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-md)' }}>
              Current Choices
            </div>
            {state.shuffled_choices.map((text, i) => (
              <div
                key={i}
                className="revealed-choice"
                style={{
                  background: 'var(--bg-secondary)',
                  padding: 'var(--space-md)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-sm)',
                  textAlign: 'left',
                  borderLeft: '3px solid var(--accent)'
                }}
              >
                {text}
              </div>
            ))}
          </div>
        )}

        {/* Connection status */}
        <div style={{ marginTop: 'var(--space-xl)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          {storytellerConnected ? (
            <span>{connectedCount} connected</span>
          ) : (
            <span style={{ color: 'var(--warning)' }}>Storyteller disconnected</span>
          )}
        </div>
      </div>

      {/* Character Modal */}
      {showCharacterModal && state.character && (
        <div
          className="modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-lg)'
          }}
          onClick={() => setShowCharacterModal(false)}
        >
          <div
            className="modal__content"
            style={{
              background: 'var(--bg-secondary)',
              padding: 'var(--space-xl)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '500px',
              width: '100%'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: 'var(--space-md)' }}>{state.character.name}</h2>
            <p style={{ lineHeight: 1.7, color: 'var(--text-secondary)' }}>{state.character.description}</p>
            <button className="btn btn--secondary" style={{ marginTop: 'var(--space-lg)' }} onClick={() => setShowCharacterModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  )
}

const playerLayoutStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-lg)',
  textAlign: 'center'
}

function Toolbar({ onToggleMode, onShowRules }: { onToggleMode: () => void; onShowRules: () => void }) {
  return (
    <div className="player-toolbar" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 'var(--space-sm)',
      padding: 'var(--space-md)',
      zIndex: 50
    }}>
      <button className="btn btn--secondary" onClick={onShowRules} aria-label="Game rules" style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.875rem' }}>
        ?
      </button>
      <button className="btn btn--secondary mode-toggle" onClick={onToggleMode} aria-label="Toggle light/dark mode" />
    </div>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-bg, rgba(0,0,0,0.8))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-lg)',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        className="modal__content"
        style={{
          background: 'var(--bg-secondary)',
          padding: 'var(--space-xl)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '500px',
          width: '100%'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2>Game Rules</h2>
        <div style={{ textAlign: 'left', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 'var(--space-md)' }}>
            <strong>Goal</strong><br />
            Reach the final scene and roll 20+ on a d20 to defeat the boss.
          </p>
          <p style={{ marginBottom: 'var(--space-md)' }}>
            <strong>Gameplay</strong><br />
            All players control one shared character. Each scene, one player decides which of 3 choices to make.
          </p>
          <p style={{ marginBottom: 'var(--space-md)' }}>
            <strong>Choice Outcomes</strong><br />
            <span style={{ color: 'var(--danger)' }}>Damage</span> — Lose 1 HP (0 HP = defeat)<br />
            <span style={{ color: 'var(--success)' }}>Item</span> — Gain an item (+1 to final roll)<br />
            <span style={{ color: 'var(--warning)' }}>Level Up</span> — Gain a level (+1 roll attempt)
          </p>
          <p>
            <strong>Final Boss</strong><br />
            Roll a d20, add your item count as a bonus. Your level = number of roll attempts. Need 20+ to win.
          </p>
        </div>
        <button className="btn btn--secondary" style={{ marginTop: 'var(--space-lg)' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
