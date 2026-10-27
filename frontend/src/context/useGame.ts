import { createContext, useContext } from 'react'
import type { GameState, ResolvedContent, Story, ThemeName } from '../types'

export interface GameContextValue {
  // State from SSE
  state: GameState | null
  resolved: ResolvedContent | null
  playerCount: number
  storytellerConnected: boolean
  isConnected: boolean
  isInitializing: boolean

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
  startSession: (storyId: string) => Promise<void>
  submitMadlib: (answer: string) => Promise<void>
  madlibBack: () => Promise<void>
  proceedFromCharacter: () => Promise<void>
  makeChoice: (choiceIndex: number) => Promise<void>
  goBack: () => Promise<void>
  finish: (outcome: 'victory' | 'defeat') => Promise<void>
  restart: () => Promise<void>
  stopSession: () => Promise<void>
  revealChoices: (showToPlayers?: boolean) => Promise<void>
  selectScene: (sceneId: string, revisit?: boolean) => Promise<void>
  selectOpeningChoice: (choiceIndex: number | null) => Promise<void>
}

export const GameContext = createContext<GameContextValue | null>(null)

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
