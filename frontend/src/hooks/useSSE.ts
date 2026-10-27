import { useEffect, useState } from 'react'
import type { SSEPayload, GameState, ResolvedContent } from '../types'
import { checkSession } from './api'

interface UseSSEOptions {
  token?: string | null
  sessionId?: string | null  // For player authentication
  enabled?: boolean          // Pages that don't need live state skip the connection
}

interface UseSSEReturn {
  state: GameState | null
  resolved: ResolvedContent | null
  playerCount: number
  storytellerConnected: boolean
  isConnected: boolean
  isInitializing: boolean
}

export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const { token, sessionId, enabled = true } = options

  const [state, setState] = useState<GameState | null>(null)
  const [resolved, setResolved] = useState<ResolvedContent | null>(null)
  const [playerCount, setPlayerCount] = useState(0)
  const [storytellerConnected, setStorytellerConnected] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isInitializing, setIsInitializing] = useState(enabled)

  useEffect(() => {
    if (!enabled) return

    let es: EventSource | null = null
    let reconnectTimer: number | null = null
    let reconnectDelay = 1000
    let stopped = false

    function clearSession() {
      setState(null)
      setResolved(null)
      setPlayerCount(0)
      setStorytellerConnected(false)
      setIsInitializing(false)
    }

    function connect() {
      const params = new URLSearchParams()
      if (token) params.set('token', token)
      if (sessionId) params.set('s', sessionId)
      const query = params.toString()
      es = new EventSource(query ? `/api/events?${query}` : '/api/events')

      es.onopen = () => {
        reconnectDelay = 1000
        setIsConnected(true)
      }

      es.onmessage = (event) => {
        try {
          const data: SSEPayload = JSON.parse(event.data)
          setIsInitializing(false)
          if (data.type === 'session_ended') {
            clearSession()
          } else if (data.type === 'state') {
            setState(data.state)
            setResolved(data.resolved)
            setPlayerCount(data.player_count)
            setStorytellerConnected(data.storyteller_connected)
          }
        } catch (e) {
          console.error('SSE parse error:', e)
        }
      }

      es.onerror = async () => {
        es?.close()
        es = null
        setIsConnected(false)

        // Stop retrying if there's no session, or we have no way to join it
        // (the server answers 403 to an EventSource as a generic error).
        try {
          const { active, valid } = await checkSession(sessionId)
          if (!active || (!token && !valid)) {
            clearSession()
            return
          }
        } catch {
          // Server unreachable: keep retrying with backoff
        }

        if (stopped) return
        reconnectTimer = window.setTimeout(connect, reconnectDelay)
        reconnectDelay = Math.min(reconnectDelay * 2, 30000)
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [enabled, token, sessionId])

  return {
    state,
    resolved,
    playerCount,
    storytellerConnected,
    isConnected,
    isInitializing: enabled && isInitializing,
  }
}
