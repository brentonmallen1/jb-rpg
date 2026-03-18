import { useEffect, useRef, useState, useCallback } from 'react'
import type { SSEPayload, GameState, ResolvedContent } from '../types'

interface UseSSEOptions {
  token?: string | null
  onStateUpdate?: (payload: SSEPayload) => void
}

interface UseSSEReturn {
  state: GameState | null
  resolved: ResolvedContent | null
  connectedCount: number
  storytellerConnected: boolean
  isConnected: boolean
}

export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const { token, onStateUpdate } = options

  const [state, setState] = useState<GameState | null>(null)
  const [resolved, setResolved] = useState<ResolvedContent | null>(null)
  const [connectedCount, setConnectedCount] = useState(0)
  const [storytellerConnected, setStorytellerConnected] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectTimerRef = useRef<number | null>(null)
  const tokenRef = useRef(token)

  // Keep token ref in sync
  useEffect(() => {
    tokenRef.current = token
  }, [token])

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    const url = tokenRef.current
      ? `/api/events?token=${encodeURIComponent(tokenRef.current)}`
      : '/api/events'

    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data: SSEPayload = JSON.parse(event.data)
        if (data.type === 'state') {
          setState(data.state)
          setResolved(data.resolved)
          setConnectedCount(data.connected_count)
          setStorytellerConnected(data.storyteller_connected)
          onStateUpdate?.(data)
        }
      } catch (e) {
        console.error('SSE parse error:', e)
      }
    }

    es.onerror = () => {
      es.close()
      eventSourceRef.current = null
      setIsConnected(false)

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

  // Reconnect when token changes
  useEffect(() => {
    if (eventSourceRef.current) {
      connect()
    }
  }, [token, connect])

  return {
    state,
    resolved,
    connectedCount,
    storytellerConnected,
    isConnected,
  }
}
