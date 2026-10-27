import { useCallback, useState } from 'react'

interface History<T> {
  past: T[]
  present: T | null
  future: T[]
  lastAt: number
}

const COALESCE_MS = 800 // a burst of typing undoes as one step
const LIMIT = 100

/** A value with undo/redo. Edits made in quick succession merge into one undo step. */
export function useUndoable<T>() {
  const [history, setHistory] = useState<History<T>>({ past: [], present: null, future: [], lastAt: 0 })

  const reset = useCallback((value: T) => setHistory({ past: [], present: value, future: [], lastAt: 0 }), [])

  const update = useCallback((change: (value: T) => T) => {
    const now = Date.now()
    setHistory(h => {
      if (h.present === null) return h
      const next = change(h.present)
      if (next === h.present) return h
      const merge = now - h.lastAt < COALESCE_MS && h.past.length > 0
      return {
        past: merge ? h.past : [...h.past.slice(-LIMIT), h.present],
        present: next,
        future: [],
        lastAt: now,
      }
    })
  }, [])

  const undo = useCallback(() => setHistory(h => {
    if (h.present === null || h.past.length === 0) return h
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastAt: 0 }
  }), [])

  const redo = useCallback(() => setHistory(h => {
    if (h.present === null || h.future.length === 0) return h
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastAt: 0 }
  }), [])

  return {
    value: history.present,
    update,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }
}
