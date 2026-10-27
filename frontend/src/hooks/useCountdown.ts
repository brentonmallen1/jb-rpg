import { useEffect, useState } from 'react'

/** Whole seconds left, from a server's "ends in N seconds" (re-anchored whenever a new value arrives). */
export function useCountdown(endsIn: number | null | undefined): number | null {
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    if (endsIn == null) return
    const deadline = Date.now() + endsIn * 1000
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 500)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [endsIn])

  return endsIn == null ? null : left ?? Math.ceil(endsIn)
}

export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
