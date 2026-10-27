interface FinaleRollInfoProps {
  items: number
  level: number
  className?: string
}

/** The rules of the final d20 roll, from the current item count and level. */
export function FinaleRollInfo({ items, level, className }: FinaleRollInfoProps) {
  return (
    <div className={className}>
      <p>Roll a d20 and add {items} (items)</p>
      <p>You have {level} roll attempt{level === 1 ? '' : 's'}</p>
      <p>Need 20+ total to win!</p>
    </div>
  )
}
