import { useEffect, useRef, useCallback, type ReactNode } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Optional: ID for the title element (auto-generated if not provided) */
  titleId?: string
}

/**
 * Accessible modal component with:
 * - Proper ARIA attributes (role="dialog", aria-modal, aria-labelledby)
 * - Focus trap (tab stays within modal)
 * - Focus restoration on close
 * - Escape key to close
 * - Backdrop click to close
 */
export function Modal({ isOpen, onClose, title, children, titleId }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const generatedTitleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`)
  const actualTitleId = titleId || generatedTitleId.current

  // Store previously focused element and focus the modal when opened
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement
      // Focus the modal container after a brief delay to ensure it's rendered
      requestAnimationFrame(() => {
        modalRef.current?.focus()
      })
    } else {
      // Restore focus when closed
      previousActiveElement.current?.focus()
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return

    const modal = modalRef.current
    if (!modal) return

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (e.shiftKey) {
      // Shift + Tab: if on first element, wrap to last
      if (document.activeElement === firstElement) {
        e.preventDefault()
        lastElement?.focus()
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === lastElement) {
        e.preventDefault()
        firstElement?.focus()
      }
    }
  }, [])

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-bg, rgba(0,0,0,0.8))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-lg)',
        zIndex: 1000
      }}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={actualTitleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="modal-content"
        style={{
          background: 'var(--bg-secondary)',
          padding: 'var(--space-xl)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          outline: 'none'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 id={actualTitleId} style={{ marginBottom: 'var(--space-md)' }}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'default'
}

/**
 * Accessible confirmation dialog to replace browser confirm()
 */
export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default'
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <p style={{ marginBottom: 'var(--space-lg)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {message}
      </p>
      <div className="flex justify-end gap-md">
        <button className="btn btn--secondary" onClick={onCancel}>
          {cancelText}
        </button>
        <button
          className={`btn ${variant === 'danger' ? 'btn--danger' : ''}`}
          onClick={onConfirm}
          autoFocus
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}

interface InputDialogProps {
  isOpen: boolean
  onSubmit: (value: string) => void
  onCancel: () => void
  title: string
  label: string
  placeholder?: string
  submitText?: string
  cancelText?: string
  initialValue?: string
  /** Whether the field is required */
  required?: boolean
}

/**
 * Accessible input dialog to replace browser prompt()
 */
export function InputDialog({
  isOpen,
  onSubmit,
  onCancel,
  title,
  label,
  placeholder = '',
  submitText = 'Submit',
  cancelText = 'Cancel',
  initialValue = '',
  required = true
}: InputDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useRef(`input-dialog-${Math.random().toString(36).slice(2, 9)}`)

  useEffect(() => {
    if (isOpen) {
      // Focus and select input when dialog opens
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [isOpen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = inputRef.current?.value.trim() || ''

    // Only validate that required fields are non-empty
    if (required && !value) {
      inputRef.current?.setCustomValidity('Please enter a value')
      inputRef.current?.reportValidity()
      return
    }

    inputRef.current?.setCustomValidity('')
    onSubmit(value)
  }

  const handleInput = () => {
    // Clear custom validity on input
    inputRef.current?.setCustomValidity('')
  }

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <form onSubmit={handleSubmit} noValidate>
        <label
          htmlFor={inputId.current}
          style={{ display: 'block', marginBottom: 'var(--space-sm)', color: 'var(--text-secondary)' }}
        >
          {label}
          {required && <span className="text-danger" aria-hidden="true"> *</span>}
        </label>
        <input
          ref={inputRef}
          id={inputId.current}
          type="text"
          className="input"
          placeholder={placeholder}
          defaultValue={initialValue}
          required={required}
          onInput={handleInput}
          style={{ width: '100%', marginBottom: 'var(--space-lg)' }}
        />
        <div className="flex justify-end gap-md">
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button type="submit" className="btn">
            {submitText}
          </button>
        </div>
      </form>
    </Modal>
  )
}
