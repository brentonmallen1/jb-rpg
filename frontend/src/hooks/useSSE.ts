import { useEffect, useState } from 'react'
import type { SSEPayload, GameState, ResolvedContent } from '../types'
import { checkSession } from './api'

// The server pings every 20s; silence for longer than this means a dead stream
// (some proxies keep a connection open after the backend has gone away)
const STALE_AFTER_MS = 50_000

interface UseSSEOptions {
  token?: string | null
  sessionId?: string | null  // For player authentication
  playerToken?: string | null  // A named player's token (turn-taking modes)
  enabled?: boolean          // Pages that don't need live state skip the connection
}

interface UseSSEReturn {
  state: GameState | null
  resolved: ResolvedContent | null
  playerCount: number
  storytellerConnected: boolean
  isConnected: boolean
  isInitializing: boolean
  sessionElsewhere: boolean  // a session is running that this client can't join (no token or link)
  playersOnline: string[]
}

export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const { token, sessionId, playerToken, enabled = true } = options

  const [state, setState] = useState<GameState | null>(null)
  const [resolved, setResolved] = useState<ResolvedContent | null>(null)
  const [playerCount, setPlayerCount] = useState(0)
  const [storytellerConnected, setStorytellerConnected] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isInitializing, setIsInitializing] = useState(enabled)
  const [sessionElsewhere, setSessionElsewhere] = useState(false)
  const [playersOnline, setPlayersOnline] = useState<string[]>([])

  useEffect(() => {
    if (!enabled) return

    let es: EventSource | null = null
    let reconnectTimer: number | null = null
    let reconnectDelay = 1000
    let stopped = false
    let lastHeard = Date.now()

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
      if (playerToken) params.set('p', playerToken)
      const query = params.toString()
      es = new EventSource(query ? `/api/events?${query}` : '/api/events')

      es.onopen = () => {
        reconnectDelay = 1000
        lastHeard = Date.now()
        setIsConnected(true)
      }

      es.addEventListener('ping', () => {
        lastHeard = Date.now()
      })

      es.onmessage = (event) => {
        lastHeard = Date.now()
        try {
          const data: SSEPayload = JSON.parse(event.data)
          setIsInitializing(false)
          setSessionElsewhere(false)
          if (data.type === 'session_ended') {
            clearSession()
          } else if (data.type === 'state') {
            setState(data.state)
            setResolved(data.resolved)
            setPlayerCount(data.player_count)
            setStorytellerConnected(data.storyteller_connected)
            setPlayersOnline(data.players_online ?? [])
          }
        } catch (e) {
          console.error('SSE parse error:', e)
        }
      }

      es.onerror = handleDisconnect
    }

    async function handleDisconnect() {
      es?.close()
      es = null
      setIsConnected(false)

      // Stop retrying if there's no session, or we have no way to join it
      // (the server answers 403 to an EventSource as a generic error).
      try {
        const { active, valid } = await checkSession(sessionId)
        if (!active || (!token && !valid)) {
          clearSession()
          setSessionElsewhere(active)
          return
        }
      } catch {
        // Server unreachable: keep retrying with backoff
      }

      if (stopped) return
      reconnectTimer = window.setTimeout(connect, reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, 10000)  // phones should rejoin quickly mid-game
    }

    connect()
    const watchdog = window.setInterval(() => {
      if (es && Date.now() - lastHeard > STALE_AFTER_MS) handleDisconnect()
    }, 10_000)

    return () => {
      stopped = true
      clearInterval(watchdog)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [enabled, token, sessionId, playerToken])

  return {
    state,
    resolved,
    playerCount,
    storytellerConnected,
    isConnected,
    isInitializing: enabled && isInitializing,
    sessionElsewhere,
    playersOnline,
  }
}
