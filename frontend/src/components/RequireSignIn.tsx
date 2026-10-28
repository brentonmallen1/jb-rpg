import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import * as api from '../hooks/api'

/**
 * The storyteller's pages: signed-out visitors go to /login. The server redirects too,
 * but the dev server serves pages itself, and an expired cookie should land here as well.
 */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [status, setStatus] = useState<'checking' | 'in' | 'out'>('checking')

  useEffect(() => {
    let cancelled = false
    api.adminSession()
      .then(s => { if (!cancelled) setStatus(s.signed_in ? 'in' : 'out') })
      .catch(() => { if (!cancelled) setStatus('in') })  // can't tell: let the page's own API calls decide
    return () => { cancelled = true }
  }, [])

  if (status === 'checking') return null
  if (status === 'out') {
    const next = location.pathname === '/' ? '' : `?next=${encodeURIComponent(location.pathname)}`
    return <Navigate to={`/login${next}`} replace />
  }
  return children
}
