import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  error?: string | null
  children: ReactNode
}

/** A labelled form field with an optional hint and an inline problem message. */
export function Field({ label, hint, htmlFor, error, children }: FieldProps) {
  return (
    <div className={`ed-field ${error ? 'ed-field--error' : ''}`}>
      <label htmlFor={htmlFor} className="ed-label">
        {label}
        {hint && <span className="ed-hint">{hint}</span>}
      </label>
      {children}
      {error && <p className="ed-error" role="alert">{error}</p>}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" autoComplete="off" {...props} className={`ed-input ${props.className ?? ''}`} />
}

/** Grows with its content (where the browser supports field-sizing). */
export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`ed-input ed-textarea ${props.className ?? ''}`} />
}

export function Section({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ed-section">
      <div className="ed-section__head">
        <h3 className="ed-section__title">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
