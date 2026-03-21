import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { GameState, ResolvedContent, Story, ThemeName } from '../types'
import { useSSE } from '../hooks/useSSE'
import { useTheme } from '../hooks/useTheme'
import * as api from '../hooks/api'

interface GameContextValue {
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
  makeChoice: (choiceIndex: number) => Promise<void>
  goBack: () => Promise<void>
  finish: (outcome: 'victory' | 'defeat') => Promise<void>
  restart: () => Promise<void>
  stopSession: () => Promise<void>
  revealChoices: (showToPlayers?: boolean) => Promise<void>
  selectScene: (sceneId: string) => Promise<void>
  selectOpeningChoice: (choiceIndex: number | null) => Promise<void>
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(api.getSessionToken)
  const [isStoryteller, setIsStoryteller] = useState(false)
  const [isValidatingToken, setIsValidatingToken] = useState(false)
  const [currentStory, setCurrentStory] = useState<Story | null>(null)

  // Theme management - default to 'modern' when no story is active (e.g., Library page)
  const { theme, colorMode, setTheme, toggleColorMode } = useTheme(
    currentStory?.theme ?? 'modern'
  )

  // SSE connection
  const { state, resolved, playerCount, storytellerConnected, isConnected, isInitializing } = useSSE({
    token: sessionToken,
  })

  // Validate token on mount
  useEffect(() => {
    if (sessionToken) {
      setIsValidatingToken(true)
      api.validateToken()
        .then(result => {
          setIsStoryteller(result.is_storyteller ?? false)
          if (!result.valid) {
            api.setSessionToken(null)
            setSessionToken(null)
          }
        })
        .catch(() => {
          api.setSessionToken(null)
          setSessionToken(null)
          setIsStoryteller(false)
        })
        .finally(() => setIsValidatingToken(false))
    }
  }, [sessionToken])

  // Update theme when story changes
  useEffect(() => {
    if (currentStory) {
      setTheme(currentStory.theme)
    }
  }, [currentStory, setTheme])

  // Actions
  const startSession = useCallback(async (storyId: string) => {
    const result = await api.startSession(storyId)
    setSessionToken(result.token)
    setIsStoryteller(true)
  }, [])

  const submitMadlib = useCallback(async (answer: string) => {
    await api.submitMadlib(answer)
  }, [])

  const makeChoice = useCallback(async (choiceIndex: number) => {
    await api.makeChoice(choiceIndex)
  }, [])

  const goBack = useCallback(async () => {
    await api.goBack()
  }, [])

  const finish = useCallback(async (outcome: 'victory' | 'defeat') => {
    await api.finish(outcome)
  }, [])

  const restart = useCallback(async () => {
    await api.restart()
    setSessionToken(null)
    setIsStoryteller(false)
  }, [])

  const stopSession = useCallback(async () => {
    await api.restart()
    setSessionToken(null)
    setIsStoryteller(false)
  }, [])

  const revealChoices = useCallback(async (showToPlayers: boolean = true) => {
    await api.revealChoices(showToPlayers)
  }, [])

  const selectScene = useCallback(async (sceneId: string) => {
    await api.selectScene(sceneId)
  }, [])

  const selectOpeningChoice = useCallback(async (choiceIndex: number | null) => {
    await api.openingChoice(choiceIndex)
  }, [])

  const value: GameContextValue = {
    state,
    resolved,
    playerCount,
    storytellerConnected,
    isConnected,
    isInitializing,
    sessionToken,
    isStoryteller,
    isValidatingToken,
    theme,
    colorMode,
    setTheme,
    toggleColorMode,
    currentStory,
    setCurrentStory,
    startSession,
    submitMadlib,
    makeChoice,
    goBack,
    finish,
    restart,
    stopSession,
    revealChoices,
    selectScene,
    selectOpeningChoice,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
