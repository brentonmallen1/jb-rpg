import { useEffect, useState } from 'react'

/** The server waits this long between digital rolls (engine.ROLL_PAUSE), so each one lands on every screen first. */
export const ROLL_PAUSE_MS = 3000

/** True for a moment after each new roll: the die is still landing, and another roll would be refused. */
export function useRollPause(rolls: number): boolean {
  const [seen, setSeen] = useState(rolls)
  const [landing, setLanding] = useState(false)
  if (rolls !== seen) {
    setSeen(rolls)
    setLanding(rolls > seen)
  }
  useEffect(() => {
    if (!landing) return
    const timer = window.setTimeout(() => setLanding(false), ROLL_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [landing, rolls])
  return landing
}
