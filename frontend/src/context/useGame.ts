import { createContext, useContext } from 'react'
import type { GameState, ResolvedContent, Story, ThemeName, TurnMode } from '../types'

export interface GameContextValue {
  // State from SSE
  state: GameState | null
  resolved: ResolvedContent | null
  playerCount: number
  storytellerConnected: boolean
  isConnected: boolean
  isInitializing: boolean
  sessionElsewhere: boolean  // running, but this tab can't see it (take over to join)
  playersOnline: string[]  // ids of named players connected right now

  // Session token
  sessionToken: string | null
  isStoryteller: boolean
  isValidatingToken: boolean

  // Theme
  theme: ThemeName
  colorMode: 'light' | 'dark'
  setTheme: (theme: ThemeName) => void
  toggleColorMode: () => void

  // Current story (for editor/run)
  currentStory: Story | null
  setCurrentStory: (story: Story | null) => void

  // Actions
  startSession: (storyId: string, force?: boolean, turnMode?: TurnMode) => Promise<void>
  resumeSession: () => Promise<void>
  endSession: () => Promise<void>
}

export const GameContext = createContext<GameContextValue | null>(null)

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
