interface HPDisplayProps {
  /** Current HP value */
  hp: number
  /** Maximum HP (default 3) */
  maxHp?: number
  /** Size of each indicator (default 40px) */
  indicatorSize?: number
  /** Optional label shown above the display */
  showLabel?: boolean
}

/**
 * Accessible HP display with visual indicators.
 * Includes screen reader text for current HP state.
 */
export function HPDisplay({
  hp,
  maxHp = 3,
  indicatorSize = 40,
  showLabel = false
}: HPDisplayProps) {
  return (
    <div style={{ textAlign: 'center' }}>
      {showLabel && (
        <div style={{
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-lg)',
          marginBottom: 'var(--space-sm)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em'
        }}>
          Health
        </div>
      )}

      {/* Accessible text for screen readers */}
      <span className="visually-hidden" aria-live="polite">
        {hp} of {maxHp} health points remaining
      </span>

      {/* Visual indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-md)' }}>
        {Array.from({ length: maxHp }).map((_, i) => (
          <span
            key={i}
            className={`hp-indicator ${i < hp ? 'hp-indicator--full' : 'hp-indicator--empty'}`}
            style={{ width: `${indicatorSize}px`, height: `${indicatorSize}px` }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}
