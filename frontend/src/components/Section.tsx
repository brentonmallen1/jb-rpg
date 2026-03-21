import { memo, type ReactNode } from 'react'

interface SectionProps {
  /** Section title */
  title?: string
  /** Section content */
  children: ReactNode
  /** Additional CSS classes */
  className?: string
  /** Render as a card */
  card?: boolean
}

/**
 * Reusable section component with optional title and card styling.
 * Provides consistent spacing and structure.
 */
export const Section = memo(function Section({
  title,
  children,
  className = '',
  card = false
}: SectionProps) {
  const baseClass = card ? 'card mb-lg' : 'mb-lg'

  return (
    <div className={`${baseClass} ${className}`.trim()}>
      {title && <h3 className="section-header">{title}</h3>}
      {children}
    </div>
  )
})

interface ContentBoxProps {
  /** Content to display */
  children: ReactNode
  /** Width constraint */
  width?: 'narrow' | 'wide' | 'full'
  /** Center text */
  centered?: boolean
}

/**
 * Content width container for constraining page content.
 */
export const ContentBox = memo(function ContentBox({
  children,
  width = 'wide',
  centered = false
}: ContentBoxProps) {
  const widthClass = width === 'narrow' ? 'content-narrow' :
                     width === 'wide' ? 'content-wide' : ''
  const centerClass = centered ? 'text-center' : ''

  return (
    <div className={`${widthClass} ${centerClass}`.trim()}>
      {children}
    </div>
  )
})
