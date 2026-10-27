import type { ReactNode } from 'react'
import type { ThemeName } from '../types'
import { getThemeVars } from '../styles/themeVars'

interface ThemedScopeProps {
  theme: ThemeName
  colorMode: 'light' | 'dark'
  className?: string
  children: ReactNode
}

/** Renders children in a story theme's colours, inside a page that uses another theme. */
export function ThemedScope({ theme, colorMode, className, children }: ThemedScopeProps) {
  return (
    <div className={className ? `${theme} ${className}` : theme} style={getThemeVars(theme, colorMode)}>
      {children}
    </div>
  )
}
