import { useCallback, useState } from 'react'

const STORAGE_KEY = 'jb_rpg_read_along'

function initial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false  // storage unavailable: listen first
  }
}

/** Whether this phone reads along: each scene's words in full, even while the storyteller is still telling it. */
export function useReadAlong() {
  const [readAlong, setState] = useState(initial)

  const setReadAlong = useCallback((next: boolean) => {
    setState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
    } catch {
      // per-device convenience only
    }
  }, [])

  return { readAlong, setReadAlong }
}
