import { useState, useEffect, useCallback, useRef } from 'react'
import type { ThemeName } from '../types'

type ColorMode = 'light' | 'dark'

interface UseThemeReturn {
  theme: ThemeName
  colorMode: ColorMode
  setTheme: (theme: ThemeName) => void
  toggleColorMode: () => void
}

const THEME_STORAGE_KEY = 'jb_rpg_color_mode'

// Dynamic theme CSS imports - only loads the active theme
const themeLoaders: Record<ThemeName, () => Promise<unknown>> = {
  cyberpunk: () => import('../styles/themes/cyberpunk.css'),
  fantasy: () => import('../styles/themes/fantasy.css'),
  deep_space: () => import('../styles/themes/deep_space.css'),
  modern: () => import('../styles/themes/modern.css'),
  horror: () => import('../styles/themes/horror.css'),
  insanity: () => import('../styles/themes/insanity.css'),
}

// Track which themes have been loaded (CSS imports are cached by the browser)
const loadedThemes = new Set<ThemeName>()

export function useTheme(initialTheme: ThemeName = 'cyberpunk'): UseThemeReturn {
  const [theme, setThemeState] = useState<ThemeName>(initialTheme)
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return (stored === 'dark' || stored === 'light') ? stored : 'dark'
  })
  const loadingRef = useRef(false)

  // Load theme CSS dynamically and apply theme class
  useEffect(() => {
    const html = document.documentElement

    // Remove all theme classes
    const themeClasses: ThemeName[] = ['cyberpunk', 'fantasy', 'deep_space', 'modern', 'horror', 'insanity']
    themeClasses.forEach(t => html.classList.remove(t))

    // Load theme CSS if not already loaded
    if (!loadedThemes.has(theme) && !loadingRef.current) {
      loadingRef.current = true
      themeLoaders[theme]().then(() => {
        loadedThemes.add(theme)
        loadingRef.current = false
        // Add theme class after CSS is loaded
        html.classList.add(theme)
      })
    } else {
      // Theme already loaded, just add the class
      html.classList.add(theme)
    }
  }, [theme])

  // Apply color mode (uses data-mode attribute, not classes)
  useEffect(() => {
    document.documentElement.dataset.mode = colorMode
    localStorage.setItem(THEME_STORAGE_KEY, colorMode)
  }, [colorMode])

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme)
  }, [])

  const toggleColorMode = useCallback(() => {
    setColorMode(prev => prev === 'light' ? 'dark' : 'light')
  }, [])

  return {
    theme,
    colorMode,
    setTheme,
    toggleColorMode,
  }
}
