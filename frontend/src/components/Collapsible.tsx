import { useState, useId } from 'react'
import type { ReactNode } from 'react'

interface CollapsibleProps {
  title: ReactNode
  preview?: string
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

export function Collapsible({
  title,
  preview,
  defaultOpen = false,
  className = '',
  children
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <div className={`collapsible ${isOpen ? 'collapsible--open' : ''} ${className}`}>
      <button
        type="button"
        className="collapsible-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <span className="collapsible-title">{title}</span>
        {!isOpen && preview && (
          <span className="collapsible-preview">{preview}</span>
        )}
        <span className="collapsible-chevron" aria-hidden="true">
          {isOpen ? '▼' : '▶'}
        </span>
      </button>
      <div
        id={contentId}
        className="collapsible-content"
        hidden={!isOpen}
      >
        <div className="collapsible-body">
          {children}
        </div>
      </div>
    </div>
  )
}
