import { useMemo } from 'react'
import { useCopyLink, usePlayerLink } from '../../hooks/usePlayerLink'
import { CloseIcon, LinkIcon } from '../../components/Icons'
import { QR_DARK, QR_LIGHT, qrModules } from '../../lib/qr'

/** A QR code drawn as one SVG path, dark on light whatever the theme, so phone cameras read it. */
export function QrCode({ text, size = 168 }: { text: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const { dark, count } = qrModules(text)
    return { path: dark.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join(''), count }
  }, [text])

  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${count} ${count}`} role="img" aria-label="QR code for the player link" shapeRendering="crispEdges">
      <rect width={count} height={count} fill={QR_LIGHT} />
      <path d={path} fill={QR_DARK} />
    </svg>
  )
}

interface InviteCardProps {
  sessionId: string
  playerCount: number
  onDismiss: () => void
}

/** Shown on the stage as a game starts: scan or share to join, with who's connected so far. */
export function InviteCard({ sessionId, playerCount, onDismiss }: InviteCardProps) {
  const link = usePlayerLink(sessionId)
  const { copied, copy, canCopyQr, qrCopied, copyQr } = useCopyLink(link)

  return (
    <section className="invite" aria-label="Invite players">
      <QrCode text={link} size={152} />
      <div className="invite__body">
        <span className="stage-label">Invite the table</span>
        <h2 className="invite__title">Scan to join on your phone</h2>
        <p className="invite__link" title={link}>{link.replace(/^https?:\/\//, '')}</p>
        <div className="invite__actions storyteller-only">
          <button type="button" className="s-btn" onClick={copy}>
            <LinkIcon size={16} /> {copied ? 'Copied' : 'Copy link'}
          </button>
          {canCopyQr && (
            <button type="button" className="s-btn s-btn--ghost" onClick={copyQr}>{qrCopied ? 'Copied' : 'Copy QR code'}</button>
          )}
        </div>
        <p className="invite__count" aria-live="polite">
          <span className={`invite__dot ${playerCount > 0 ? 'is-on' : ''}`} />
          {playerCount === 0 ? 'No players connected yet' : `${playerCount} ${playerCount === 1 ? 'player' : 'players'} connected`}
        </p>
      </div>
      <button type="button" className="icon-btn invite__close storyteller-only" onClick={onDismiss} aria-label="Hide the invite" title="Hide (the link button in the toolbar brings it back)">
        <CloseIcon size={16} />
      </button>
    </section>
  )
}
