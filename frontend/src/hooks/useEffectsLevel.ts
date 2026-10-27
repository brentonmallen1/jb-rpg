import { useCallback, useState } from 'react'

/** How much atmosphere to play: full effects, gentle fades only, or none. */
export type EffectsLevel = 'full' | 'subtle' | 'off'

const STORAGE_KEY = 'jb_rpg_effects'

function initialLevel(): EffectsLevel {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'full' || stored === 'subtle' || stored === 'off') return stored
  } catch {
    // storage unavailable: fall through to the system preference
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'subtle' : 'full'
}

/** The table's "no flashing" setting caps every screen at subtle (fades only). */
export function capLevel(level: EffectsLevel, noFlashing: boolean | undefined): EffectsLevel {
  return noFlashing && level === 'full' ? 'subtle' : level
}

export function useEffectsLevel() {
  const [level, setLevelState] = useState<EffectsLevel>(initialLevel)

  const setLevel = useCallback((next: EffectsLevel) => {
    setLevelState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // per-device convenience only
    }
  }, [])


  return { level, setLevel }
}
