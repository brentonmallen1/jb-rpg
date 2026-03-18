import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { GameState, ResolvedContent, Story, ThemeName } from '../types'
import { useSSE } from '../hooks/useSSE'
import { useTheme } from '../hooks/useTheme'
import * as api from '../hooks/api'

interface GameContextValue {
  // State from SSE
  state: GameState | null
  resolved: ResolvedContent | null
  connectedCount: number
  storytellerConnected: boolean
  isConnected: boolean

  // Session token
  sessionToken: string | null
  isStoryteller: boolean

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
  revealChoices: () => Promise<void>
  selectScene: (sceneId: string) => Promise<void>
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(api.getSessionToken)
  const [isStoryteller, setIsStoryteller] = useState(false)
  const [currentStory, setCurrentStory] = useState<Story | null>(null)

  // Theme management
  const { theme, colorMode, setTheme, toggleColorMode } = useTheme(
    currentStory?.theme ?? 'cyberpunk'
  )

  // SSE connection
  const { state, resolved, connectedCount, storytellerConnected, isConnected } = useSSE({
    token: sessionToken,
  })

  // Validate token on mount
  useEffect(() => {
    if (sessionToken) {
      api.validateToken().then(result => {
        setIsStoryteller(result.is_storyteller)
        if (!result.valid) {
          api.setSessionToken(null)
          setSessionToken(null)
        }
      })
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

  const revealChoices = useCallback(async () => {
    await api.revealChoices()
  }, [])

  const selectScene = useCallback(async (sceneId: string) => {
    await api.selectScene(sceneId)
  }, [])

  const value: GameContextValue = {
    state,
    resolved,
    connectedCount,
    storytellerConnected,
    isConnected,
    sessionToken,
    isStoryteller,
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
    revealChoices,
    selectScene,
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
