import { memo } from 'react'

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
 * Memoized to prevent unnecessary re-renders.
 */
export const StatBlock = memo(function StatBlock({ value, label, size = 'default' }: StatBlockProps) {
  return (
    <div className="text-center">
      <div className={`font-bold text-accent ${size === 'large' ? 'text-4xl' : 'text-3xl'}`}>
        {value}
      </div>
      <div className="text-secondary text-sm">
        {label}
      </div>
    </div>
  )
})

interface StatsRowProps {
  level: number
  itemCount: number
  size?: 'default' | 'large'
}

/**
 * Displays Level and Items stats in a row.
 * Memoized to prevent unnecessary re-renders.
 */
export const StatsRow = memo(function StatsRow({ level, itemCount, size = 'default' }: StatsRowProps) {
  return (
    <div className="center gap-xl">
      <StatBlock value={level} label="Level" size={size} />
      <StatBlock value={itemCount} label="Items" size={size} />
    </div>
  )
})
