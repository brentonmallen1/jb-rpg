import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { Story, TurnMode } from '../types'
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
  const { state, resolved, playerCount, storytellerConnected, isConnected, isInitializing, sessionElsewhere, playersOnline } = useSSE({
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
  // start/resume issue a fresh storyteller token for this tab
  const becomeStoryteller = useCallback((token: string) => {
    setValidatedToken(token)
    setSessionToken(token)
    setIsStoryteller(true)
  }, [])

  const startSession = useCallback(async (storyId: string, force: boolean = false, turnMode: TurnMode = 'storyteller') => {
    becomeStoryteller((await api.startSession(storyId, force, turnMode)).token)
  }, [becomeStoryteller])

  const resumeSession = useCallback(async () => {
    becomeStoryteller((await api.resumeSession()).token)
  }, [becomeStoryteller])







  const endSession = useCallback(async () => {
    await api.restart()
    setSessionToken(null)
    setIsStoryteller(false)
  }, [])




  const value: GameContextValue = {
    state,
    resolved,
    playerCount,
    storytellerConnected,
    isConnected,
    isInitializing,
    sessionElsewhere,
    playersOnline,
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
    resumeSession,
    endSession,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
