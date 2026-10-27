import { useCallback, useEffect, useState } from 'react'
import * as api from './api'

export interface PlayerIdentity {
  id: string
  name: string
  token: string
}

const keyFor = (sessionId: string) => `jb_rpg_player_${sessionId}`

function read(sessionId: string | undefined): PlayerIdentity | null {
  if (!sessionId) return null
  try {
    return JSON.parse(localStorage.getItem(keyFor(sessionId)) ?? 'null')
  } catch {
    return null
  }
}

/**
 * Which named player this phone is, in the turn-taking modes. Kept per session in
 * localStorage, so refreshing or reconnecting doesn't mean joining again.
 */
export function usePlayerIdentity(sessionId: string | undefined) {
  const [identity, setIdentity] = useState<PlayerIdentity | null>(() => read(sessionId))
  const [watching, setWatching] = useState(false)

  const forget = useCallback(() => {
    if (sessionId) {
      try {
        localStorage.removeItem(keyFor(sessionId))
      } catch {
        // nothing stored
      }
    }
    setIdentity(null)
  }, [sessionId])

  // A stored identity may be stale (the storyteller removed this player, or a new game began)
  const token = identity?.token
  useEffect(() => {
    if (!token) return
    let cancelled = false
    api.whoAmI(token).catch(err => {
      if (!cancelled && err instanceof api.ApiError && err.status === 403) forget()
    })
    return () => { cancelled = true }
  }, [token, forget])

  const join = useCallback(async (name: string) => {
    if (!sessionId) return
    const { player, token } = await api.joinSession(sessionId, name)
    const next = { ...player, token }
    try {
      localStorage.setItem(keyFor(sessionId), JSON.stringify(next))
    } catch {
      // still joined for this page load
    }
    setIdentity(next)
  }, [sessionId])

  return { identity, join, forget, watching, watch: () => setWatching(true) }
}
