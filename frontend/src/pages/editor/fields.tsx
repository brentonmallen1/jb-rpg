import { useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { ExpandIcon } from '../../components/Icons'
import { usePlaceholderSuggest } from './suggest'

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

/** Typing "{" offers the placeholders the field can hold (see suggest.tsx). */
export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null)
  const { popup, handlers } = usePlaceholderSuggest(ref)
  return (
    <div className="ed-textwrap">
      <input type="text" autoComplete="off" {...props} {...chain(props, handlers)} ref={ref} className={`ed-input ${props.className ?? ''}`} />
      {popup}
    </div>
  )
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Write it in the larger window */
  onExpand?: () => void
}

/** Grows with its content (where the browser supports field-sizing). Typing "{" offers placeholders. */
export function TextArea({ onExpand, ...props }: TextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { popup, handlers } = usePlaceholderSuggest(ref)
  return (
    <div className={`ed-textwrap ${onExpand ? 'ed-textwrap--expandable' : ''}`}>
      <textarea rows={3} {...props} {...chain(props, handlers)} ref={ref} className={`ed-input ed-textarea ${props.className ?? ''}`} />
      {onExpand && (
        <button type="button" className="ed-expand" onClick={onExpand} aria-label="Write in a larger window" title="Write in a larger window">
          <ExpandIcon size={14} />
        </button>
      )}
      {popup}
    </div>
  )
}

type Handlers = ReturnType<typeof usePlaceholderSuggest>['handlers']

/** The field's own handlers run first; the suggestions' after, unless the field handled the key. */
function chain(props: Partial<Record<keyof Handlers, ((e: never) => void) | undefined>>, own: Handlers) {
  return Object.fromEntries(
    (Object.keys(own) as (keyof Handlers)[]).map(name => [name, (e: React.SyntheticEvent) => {
      ;(props[name] as ((e: React.SyntheticEvent) => void) | undefined)?.(e)
      if (!e.defaultPrevented) (own[name] as (e: React.SyntheticEvent) => void)(e)
    }]),
  )
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
