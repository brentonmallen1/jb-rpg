import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { Story } from '../types'
import { useSSE } from '../hooks/useSSE'
import { useTheme } from '../hooks/useTheme'
import * as api from '../hooks/api'
import { GameContext, type GameContextValue } from './useGame'


export function GameProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(api.getSessionToken)
  const [isStoryteller, setIsStoryteller] = useState(false)
  const [validatedToken, setValidatedToken] = useState<string | null>(null)
  const isValidatingToken = !!sessionToken && validatedToken !== sessionToken
  const [currentStory, setCurrentStory] = useState<Story | null>(null)

  // Theme management - default to 'modern' when no story is active (e.g., Library page)
  const { theme, colorMode, setTheme, toggleColorMode } = useTheme(
    currentStory?.theme ?? 'modern'
  )

  // Shared SSE connection for storyteller pages; the player page opens its own
  const onPlayerPage = useLocation().pathname.startsWith('/player')
  const { state, resolved, playerCount, storytellerConnected, isConnected, isInitializing } = useSSE({
    token: sessionToken,
    enabled: !onPlayerPage,
  })

  // Validate a token restored from sessionStorage (once per token)
  useEffect(() => {
    if (!sessionToken || validatedToken === sessionToken) return
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
      .finally(() => setValidatedToken(sessionToken))
  }, [sessionToken, validatedToken])

  // Update theme when story changes
  useEffect(() => {
    if (currentStory) {
      setTheme(currentStory.theme)
    }
  }, [currentStory, setTheme])

  // Actions
  const startSession = useCallback(async (storyId: string) => {
    const result = await api.startSession(storyId)
    setValidatedToken(result.token)
    setSessionToken(result.token)
    setIsStoryteller(true)
  }, [])

  const submitMadlib = useCallback(async (answer: string) => {
    await api.submitMadlib(answer)
  }, [])

  const madlibBack = useCallback(async () => {
    await api.madlibBack()
  }, [])

  const proceedFromCharacter = useCallback(async () => {
    await api.proceedFromCharacter()
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

  const selectScene = useCallback(async (sceneId: string, revisit: boolean = false) => {
    await api.selectScene(sceneId, revisit)
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
    madlibBack,
    proceedFromCharacter,
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
