import { memo } from 'react'

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
 * Memoized to prevent unnecessary re-renders.
 */
export const HPDisplay = memo(function HPDisplay({
  hp,
  maxHp = 3,
  indicatorSize = 40,
  showLabel = false
}: HPDisplayProps) {
  return (
    <div className="text-center">
      {showLabel && (
        <div className="text-secondary text-lg uppercase mb-sm" style={{ letterSpacing: '0.1em' }}>
          Health
        </div>
      )}

      {/* Accessible text for screen readers */}
      <span className="visually-hidden" aria-live="polite">
        {hp} of {maxHp} health points remaining
      </span>

      {/* Visual indicators */}
      <div className="center gap-md">
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
})
