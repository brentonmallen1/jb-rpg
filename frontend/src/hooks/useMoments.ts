import { useCallback, useState } from 'react'
import { diffMoments, type Moment } from '../lib/moments'
import type { GameState, ResolvedContent } from '../types'

export type QueuedMoment = Moment & { id: number }

/**
 * Turns the stream of SSE states into a queue of moments to play, one at a time.
 * `current` is the moment on stage; call `done(id)` when it finishes.
 */
export function useMoments(state: GameState | null, resolved: ResolvedContent | null) {
  const [seen, setSeen] = useState({ state, resolved })
  const [queue, setQueue] = useState<QueuedMoment[]>([])
  const [nextId, setNextId] = useState(0)

  // Diff during render (React's "adjust state when props change" pattern) so the
  // first frame of a new state already knows what to play
  if (seen.state !== state || seen.resolved !== resolved) {
    const moments = diffMoments(seen.state, state, seen.resolved, resolved)
    setSeen({ state, resolved })
    if (moments.length) {
      setQueue(q => [...q, ...moments.map((m, i) => ({ ...m, id: nextId + i }))])
      setNextId(nextId + moments.length)
    }
  }

  const done = useCallback((id: number) => {
    setQueue(q => q.filter(m => m.id !== id))
  }, [])

  return { current: queue[0] ?? null, done }
}
