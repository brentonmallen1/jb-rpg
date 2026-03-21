import type { ReactNode } from 'react'

interface PageNavProps {
  /** Primary title text */
  title: string
  /** Left-side content (before title) */
  leftContent?: ReactNode
  /** Right-side action buttons */
  children?: ReactNode
}

/**
 * Consistent page navigation bar component.
 * Used across Library, Run, Editor, and other pages.
 */
export function PageNav({ title, leftContent, children }: PageNavProps) {
  return (
    <nav className="nav">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', minWidth: 0 }}>
        {leftContent}
        <span className="nav__title">{title}</span>
      </div>
      {children && (
        <div className="nav__actions">
          {children}
        </div>
      )}
    </nav>
  )
}
