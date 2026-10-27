import { useEffect, useRef } from 'react'

/**
 * Single-key shortcuts for the storyteller ("r", "1", "enter", "escape", ...).
 * Ignored while typing in a field or when a modifier key is held.
 */
export function useHotkeys(bindings: Record<string, (() => void) | undefined | false>, enabled = true) {
  const latest = useRef(bindings)
  useEffect(() => {
    latest.current = bindings
  })

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      const handler = latest.current[e.key.toLowerCase()]
      if (handler) {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
