import { useEffect, useState } from 'react'
import * as api from './api'

/** The players' join link. BASE_URL (behind a reverse proxy) wins over the address the storyteller happens to use. */
export function usePlayerLink(sessionId: string) {
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  useEffect(() => {
    api.getConfig().then(c => setBaseUrl(c.base_url)).catch(() => setBaseUrl(null))
  }, [])
  return `${(baseUrl || window.location.origin).replace(/\/$/, '')}/player/${sessionId}`
}

/** Copy, or the phone/tablet share sheet where there is one. */
export function useCopyLink(link: string) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  const canShare = typeof navigator.share === 'function'
  function share() {
    navigator.share({ title: 'Join the game', url: link }).catch(() => {})
  }
  return { copied, copy, canShare, share }
}
