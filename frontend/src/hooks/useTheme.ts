import { useState, useEffect, useCallback } from 'react'
import type { ThemeName } from '../types'

type ColorMode = 'light' | 'dark'

interface UseThemeReturn {
  theme: ThemeName
  colorMode: ColorMode
  setTheme: (theme: ThemeName) => void
  toggleColorMode: () => void
}

const THEME_STORAGE_KEY = 'jb_rpg_color_mode'

export function useTheme(initialTheme: ThemeName = 'cyberpunk'): UseThemeReturn {
  const [theme, setThemeState] = useState<ThemeName>(initialTheme)
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return (stored === 'dark' || stored === 'light') ? stored : 'dark'
  })

  // Apply theme class to html element
  useEffect(() => {
    const html = document.documentElement

    // Remove all theme classes
    const themeClasses = ['cyberpunk', 'fantasy', 'deep_space', 'modern', 'horror', 'insanity']
    themeClasses.forEach(t => html.classList.remove(t))

    // Add current theme
    html.classList.add(theme)
  }, [theme])

  // Apply color mode
  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('light', 'dark')
    html.classList.add(colorMode)
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
