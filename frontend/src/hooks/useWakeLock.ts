import { useEffect } from 'react'

/** Keep the screen awake while `active` (phones sleep mid-scene otherwise). Best effort. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false

    async function acquire() {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        // denied (e.g. battery saver): the game still works
      }
    }

    // The browser drops the lock when the tab is hidden; take it back on return
    function onVisible() {
      if (document.visibilityState === 'visible' && !released) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [active])
}
