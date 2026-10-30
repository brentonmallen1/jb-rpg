import { createContext, useContext } from 'react'
import type { GameState, PathProgress, ResolvedContent, Story, ThemeName, GameOptions, VoteTally } from '../types'

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
  voteTally: VoteTally | null  // how the table is voting (storyteller only)
  pathProgress: PathProgress | null  // branching stories: played, and how many may be left (storyteller only)

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
  startSession: (storyId: string, force?: boolean, options?: GameOptions) => Promise<void>
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
