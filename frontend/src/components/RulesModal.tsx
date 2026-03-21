import { Modal } from './Modal'

interface RulesModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Shared rules modal component used in Run and Player views
 */
export function RulesModal({ isOpen, onClose }: RulesModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Game Rules">
      <div style={{ textAlign: 'left', lineHeight: 1.8 }}>
        <p style={{ marginBottom: 'var(--space-md)' }}>
          <strong>Goal</strong><br />
          Reach the final scene and roll 20+ on a d20 to defeat the boss.
        </p>
        <p style={{ marginBottom: 'var(--space-md)' }}>
          <strong>Gameplay</strong><br />
          All players control one shared character. Play through scenes one at a time. Each scene, one player decides which of 3 choices to make.
        </p>
        <p style={{ marginBottom: 'var(--space-md)' }}>
          <strong>Choice Outcomes</strong><br />
          <span style={{ color: 'var(--danger)' }}>Damage</span> — Lose 1 HP (0 HP = defeat)<br />
          <span style={{ color: 'var(--success)' }}>Item</span> — Gain an item (+1 to final roll)<br />
          <span style={{ color: 'var(--warning)' }}>Level Up</span> — Gain a level (+1 roll attempt)
        </p>
        <p style={{ marginBottom: 'var(--space-md)' }}>
          <strong>Starting Stats</strong><br />
          3 HP, Level 1, 0 Items
        </p>
        <p>
          <strong>Final Boss</strong><br />
          Roll a d20, add your item count as a bonus. Your level = number of roll attempts. Need 20+ total to win.
        </p>
      </div>
      <button
        className="btn btn--secondary"
        style={{ marginTop: 'var(--space-lg)', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
        onClick={onClose}
      >
        Close
      </button>
    </Modal>
  )
}
