type ColorMode = 'light' | 'dark'

interface ModeToggleProps {
  colorMode: ColorMode
  onToggle: () => void
}

/**
 * Light/dark mode toggle button.
 * Displays sun in dark mode, moon in light mode.
 */
export function ModeToggle({ colorMode, onToggle }: ModeToggleProps) {
  return (
    <button
      className="btn btn--secondary mode-toggle"
      onClick={onToggle}
      aria-label="Toggle light/dark mode"
    >
      {colorMode === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
