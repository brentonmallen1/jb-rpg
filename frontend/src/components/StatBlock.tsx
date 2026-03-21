interface StatBlockProps {
  /** The numeric value to display */
  value: number
  /** Label shown below the value */
  label: string
  /** Optional: size variant */
  size?: 'default' | 'large'
}

/**
 * Displays a stat value with a label underneath.
 * Used for Level, Items count, etc.
 */
export function StatBlock({ value, label, size = 'default' }: StatBlockProps) {
  const fontSize = size === 'large' ? 'var(--text-4xl)' : 'var(--text-3xl)'

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize, fontWeight: 'bold', color: 'var(--accent)' }}>
        {value}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
        {label}
      </div>
    </div>
  )
}

interface StatsRowProps {
  level: number
  itemCount: number
  size?: 'default' | 'large'
}

/**
 * Displays Level and Items stats in a row.
 * Common pattern used in Run and Player views.
 */
export function StatsRow({ level, itemCount, size = 'default' }: StatsRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-xl)' }}>
      <StatBlock value={level} label="Level" size={size} />
      <StatBlock value={itemCount} label="Items" size={size} />
    </div>
  )
}
