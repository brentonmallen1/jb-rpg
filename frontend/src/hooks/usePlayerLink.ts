import { useEffect, useState } from 'react'
import * as api from './api'
import { qrPng } from '../lib/qr'

/** The players' join link. BASE_URL (behind a reverse proxy) wins over the address the storyteller happens to use. */
export function usePlayerLink(sessionId: string) {
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  useEffect(() => {
    api.getConfig().then(c => setBaseUrl(c.base_url)).catch(() => setBaseUrl(null))
  }, [])
  return `${(baseUrl || window.location.origin).replace(/\/$/, '')}/player/${sessionId}`
}

/** Copy the link, or the QR code as an image (where the browser can put images on the clipboard). */
export function useCopyLink(link: string) {
  const [copied, setCopied] = useState(false)
  const [qrCopied, setQrCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  const canCopyQr = typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'
  function copyQr() {
    // Safari wants the image promise handed over inside the click, so the item is built before it resolves
    navigator.clipboard.write([new ClipboardItem({ 'image/png': qrPng(link) })]).then(() => {
      setQrCopied(true)
      setTimeout(() => setQrCopied(false), 2000)
    }).catch(() => {})
  }
  return { copied, copy, canCopyQr, qrCopied, copyQr }
}
