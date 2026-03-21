import { memo, type ReactNode } from 'react'

interface PageMessageProps {
  /** Main title/heading */
  title?: string
  /** Message text */
  message: string
  /** Optional action button */
  action?: ReactNode
  /** Visual variant */
  variant?: 'default' | 'warning' | 'error'
}

/**
 * Full-page centered message for empty states, loading, and errors.
 * Used for "No Active Session", "Session Not Found", etc.
 */
export const PageMessage = memo(function PageMessage({
  title,
  message,
  action,
  variant = 'default'
}: PageMessageProps) {
  const titleClass = variant === 'warning' ? 'text-warning' :
                     variant === 'error' ? 'text-danger' : ''

  return (
    <main className="container page-centered">
      {title && <h1 className={titleClass}>{title}</h1>}
      <p className="text-secondary mb-lg">{message}</p>
      {action}
    </main>
  )
})
