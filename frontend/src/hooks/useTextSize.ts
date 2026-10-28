import { useCallback, useEffect, useState } from 'react'

/** How big a phone's text is. The phone's styles are in rem, so scaling the root scales the page. */
export type TextSize = 'small' | 'default' | 'large' | 'largest'

export const TEXT_SCALE: Record<TextSize, string> = {
  small: '90%',
  default: '100%',
  large: '115%',
  largest: '132%',
}

const STORAGE_KEY = 'jb_rpg_text_size'

function initialSize(): TextSize {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && stored in TEXT_SCALE) return stored as TextSize
  } catch {
    // storage unavailable: the default size
  }
  return 'default'
}

/** This device's text size, applied to the page while the component using it is mounted. */
export function useTextSize() {
  const [size, setSizeState] = useState<TextSize>(initialSize)

  useEffect(() => {
    const root = document.documentElement
    const before = root.style.fontSize
    root.style.fontSize = TEXT_SCALE[size]
    return () => { root.style.fontSize = before }
  }, [size])

  const setSize = useCallback((next: TextSize) => {
    setSizeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // per-device convenience only
    }
  }, [])

  return { size, setSize }
}
