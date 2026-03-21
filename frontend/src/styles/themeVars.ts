import type { ThemeName } from '../types'
import type { CSSProperties } from 'react'

// CSS variables for each theme, used for scoped per-card theming
// Dark mode values (default)
export const themeVars: Record<ThemeName, CSSProperties> = {
  cyberpunk: {
    '--bg-primary': '#0a0a12',
    '--bg-secondary': '#12121f',
    '--text-primary': '#0ff',
    '--text-secondary': '#888',
    '--accent': '#f0f',
    '--accent-hover': '#f5f',
    '--danger': '#f00',
    '--success': '#0f0',
    '--warning': '#ff0',
  } as CSSProperties,

  fantasy: {
    '--bg-primary': '#1a1410',
    '--bg-secondary': '#2a2018',
    '--text-primary': '#f4e8d8',
    '--text-secondary': '#a89080',
    '--accent': '#d4a574',
    '--accent-hover': '#e8b888',
    '--danger': '#8b3a3a',
    '--success': '#4a7c4a',
    '--warning': '#b8860b',
  } as CSSProperties,

  deep_space: {
    '--bg-primary': '#0a0a1a',
    '--bg-secondary': '#141428',
    '--text-primary': '#e8e8ff',
    '--text-secondary': '#8888aa',
    '--accent': '#9966ff',
    '--accent-hover': '#aa88ff',
    '--danger': '#ff4466',
    '--success': '#44ff88',
    '--warning': '#ffaa00',
  } as CSSProperties,

  modern: {
    '--bg-primary': '#1a1a1e',
    '--bg-secondary': '#2a2a30',
    '--text-primary': '#f5f5f7',
    '--text-secondary': '#a0a0a5',
    '--accent': '#5856d6',
    '--accent-hover': '#6e6cd8',
    '--danger': '#ff3b30',
    '--success': '#34c759',
    '--warning': '#ff9500',
  } as CSSProperties,

  horror: {
    '--bg-primary': '#0d0d0d',
    '--bg-secondary': '#1a0a0a',
    '--text-primary': '#e8e0e0',
    '--text-secondary': '#886666',
    '--accent': '#8b0000',
    '--accent-hover': '#a00000',
    '--danger': '#ff4444', /* Softened for better luminance balance */
    '--success': '#228b22',
    '--warning': '#ff6600',
  } as CSSProperties,

  insanity: {
    '--bg-primary': '#0a1a1a',
    '--bg-secondary': '#0f2828',
    '--text-primary': '#c4d9d4',
    '--text-secondary': '#5a8a7f',
    '--accent': '#2dd9b4',
    '--accent-hover': '#3eecc7',
    '--danger': '#9b4dca',
    '--success': '#2dd36f',
    '--warning': '#d4a017',
  } as CSSProperties,
}

// Light mode overrides
export const themeVarsLight: Record<ThemeName, CSSProperties> = {
  cyberpunk: {
    '--bg-primary': '#e8f8f8',
    '--bg-secondary': '#fff',
    '--text-primary': '#0a4a4a',
    '--text-secondary': '#3a5566', /* Darkened for 4.5:1 contrast ratio */
    '--accent': '#f0f',
    '--accent-hover': '#f5f',
    '--danger': '#f00',
    '--success': '#0f0',
    '--warning': '#ff0',
  } as CSSProperties,

  fantasy: {
    '--bg-primary': '#f8f4e8',
    '--bg-secondary': '#fff',
    '--text-primary': '#2a1810',
    '--text-secondary': '#6a5040',
    '--accent': '#d4a574',
    '--accent-hover': '#e8b888',
    '--danger': '#8b3a3a',
    '--success': '#4a7c4a',
    '--warning': '#b8860b',
  } as CSSProperties,

  deep_space: {
    '--bg-primary': '#f0f0ff',
    '--bg-secondary': '#fff',
    '--text-primary': '#1a1a3a',
    '--text-secondary': '#6666aa',
    '--accent': '#9966ff',
    '--accent-hover': '#aa88ff',
    '--danger': '#ff4466',
    '--success': '#44ff88',
    '--warning': '#ffaa00',
  } as CSSProperties,

  modern: {
    '--bg-primary': '#f5f5f7',
    '--bg-secondary': '#ffffff',
    '--text-primary': '#1d1d1f',
    '--text-secondary': '#86868b',
    '--accent': '#5856d6',
    '--accent-hover': '#6e6cd8',
    '--danger': '#ff3b30',
    '--success': '#34c759',
    '--warning': '#ff9500',
  } as CSSProperties,

  horror: {
    '--bg-primary': '#f5f0f0',
    '--bg-secondary': '#fff',
    '--text-primary': '#1a0a0a',
    '--text-secondary': '#664444',
    '--accent': '#8b0000',
    '--accent-hover': '#a00000',
    '--danger': '#ff0000',
    '--success': '#228b22',
    '--warning': '#ff6600',
  } as CSSProperties,

  insanity: {
    '--bg-primary': '#f4f1e8',
    '--bg-secondary': '#fff',
    '--text-primary': '#0f2828',
    '--text-secondary': '#3a5a4f',
    '--accent': '#2dd9b4',
    '--accent-hover': '#3eecc7',
    '--danger': '#9b4dca',
    '--success': '#2dd36f',
    '--warning': '#d4a017',
  } as CSSProperties,
}

export function getThemeVars(theme: ThemeName, colorMode: 'light' | 'dark'): CSSProperties {
  return colorMode === 'light' ? themeVarsLight[theme] : themeVars[theme]
}
