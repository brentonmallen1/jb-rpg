import { useCallback, useState } from 'react'
import { diffMoments, type Moment } from '../lib/moments'
import type { GameState, ResolvedContent } from '../types'

export type QueuedMoment = Moment & { id: number }

// Beats that can be skipped when newer ones pile up; the big ones always play
const SKIPPABLE = new Set(['scene_changed', 'choices_revealed', 'decider', 'character_revealed', 'item_gained', 'level_up'])
const MAX_WAITING = 3

// Only the latest of these matters: an older "Wren decides" is wrong once it's Bea's turn
const LATEST_ONLY = new Set(['decider', 'scene_changed', 'choices_revealed'])

/** Keep the one playing; drop superseded beats, then the oldest skippable ones if too many wait. */
function trim(queue: QueuedMoment[]): QueuedMoment[] {
  const [playing, ...queued] = queue
  const waiting = queued.filter((m, i) => !LATEST_ONLY.has(m.type) || !queued.slice(i + 1).some(n => n.type === m.type))
  let excess = waiting.length - MAX_WAITING
  const kept = waiting.filter(m => {
    if (excess > 0 && SKIPPABLE.has(m.type)) {
      excess--
      return false
    }
    return true
  })
  return playing ? [playing, ...kept] : kept
}

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
      setQueue(q => trim([...q, ...moments.map((m, i) => ({ ...m, id: nextId + i }))]))
      setNextId(nextId + moments.length)
    }
  }

  const done = useCallback((id: number) => {
    setQueue(q => q.filter(m => m.id !== id))
  }, [])

  return { current: queue[0] ?? null, done }
}
