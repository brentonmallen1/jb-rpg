import { useEffect, useRef, useState, useCallback } from 'react'
import type { SSEPayload, GameState, ResolvedContent } from '../types'

interface UseSSEOptions {
  token?: string | null
  sessionId?: string | null  // For player authentication
  onStateUpdate?: (payload: SSEPayload) => void
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
  const { token, sessionId, onStateUpdate } = options

  const [state, setState] = useState<GameState | null>(null)
  const [resolved, setResolved] = useState<ResolvedContent | null>(null)
  const [playerCount, setPlayerCount] = useState(0)
  const [storytellerConnected, setStorytellerConnected] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectTimerRef = useRef<number | null>(null)
  const tokenRef = useRef(token)
  const sessionIdRef = useRef(sessionId)

  // Keep refs in sync
  useEffect(() => {
    tokenRef.current = token
  }, [token])

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    // Build URL with query params
    const params = new URLSearchParams()
    if (tokenRef.current) params.set('token', tokenRef.current)
    if (sessionIdRef.current) params.set('s', sessionIdRef.current)
    const url = params.toString() ? `/api/events?${params.toString()}` : '/api/events'

    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data: SSEPayload = JSON.parse(event.data)
        setIsInitializing(false)
        if (data.type === 'session_ended') {
          // Session was terminated - reset state and stop reconnecting
          setState(null)
          setResolved(null)
          setPlayerCount(0)
          setStorytellerConnected(false)
          return
        }
        if (data.type === 'state') {
          setState(data.state)
          setResolved(data.resolved)
          setPlayerCount(data.player_count)
          setStorytellerConnected(data.storyteller_connected)
          onStateUpdate?.(data)
        }
      } catch (e) {
        console.error('SSE parse error:', e)
      }
    }

    es.onerror = async () => {
      es.close()
      eventSourceRef.current = null
      setIsConnected(false)

      // Check if session still exists before reconnecting
      // This handles 403 errors gracefully by detecting session termination
      try {
        const res = await fetch('/api/config')
        if (res.ok) {
          const config = await res.json()
          // If no active session, reset state and don't reconnect
          if (!config.session_id) {
            setState(null)
            setResolved(null)
            setPlayerCount(0)
            setStorytellerConnected(false)
            setIsInitializing(false)
            return
          }
        }
      } catch {
        // Config fetch failed, proceed with normal reconnect
      }

      console.log(`SSE reconnecting in ${reconnectDelayRef.current}ms...`)
      reconnectTimerRef.current = window.setTimeout(() => {
        connect()
      }, reconnectDelayRef.current)

      // Exponential backoff (max 30s)
      reconnectDelayRef.current = Math.min(
        reconnectDelayRef.current * 2,
        30000
      )
    }

    es.onopen = () => {
      reconnectDelayRef.current = 1000
      setIsConnected(true)
    }
  }, [onStateUpdate])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [connect])

  // Reconnect when token or sessionId changes
  useEffect(() => {
    if (eventSourceRef.current) {
      connect()
    }
  }, [token, sessionId, connect])

  return {
    state,
    resolved,
    playerCount,
    storytellerConnected,
    isConnected,
    isInitializing,
  }
}
