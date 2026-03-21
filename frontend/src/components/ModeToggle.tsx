import { memo } from 'react'

type ColorMode = 'light' | 'dark'

interface ModeToggleProps {
  colorMode: ColorMode
  onToggle: () => void
}

/**
 * Light/dark mode toggle button.
 * Memoized to prevent unnecessary re-renders.
 */
export const ModeToggle = memo(function ModeToggle({ colorMode, onToggle }: ModeToggleProps) {
  return (
    <button
      className="btn btn--secondary mode-toggle"
      onClick={onToggle}
      aria-label="Toggle light/dark mode"
    >
      {colorMode === 'dark' ? '☀️' : '🌙'}
    </button>
  )
})
