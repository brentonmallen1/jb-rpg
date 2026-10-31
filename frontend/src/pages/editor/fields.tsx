import { useContext, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { ChevronUpIcon, ExpandIcon } from '../../components/Icons'
import { usePlaceholderSuggest } from './suggest'
import { FoldingSections, REVEAL_EVENT } from './folding'

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

interface SectionProps {
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
}

export function Section(props: SectionProps) {
  const folding = useContext(FoldingSections)
  if (folding) return <FoldingSection {...props} />
  const { title, aside, children } = props
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

const FOLDED_KEY = 'jb_rpg_folded_sections'

function foldedSections(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function rememberFolded(name: string, folded: boolean) {
  const all = foldedSections()
  if (folded) all.add(name)
  else all.delete(name)
  try {
    localStorage.setItem(FOLDED_KEY, JSON.stringify([...all]))
  } catch {
    // per-device convenience only
  }
}

/** A section that folds to its title. Folded or open is remembered on this device by name (without a
 * count: "Questions (3)" is "Questions"), so it stays that way from one scene to the next. */
function FoldingSection({ title, aside, children }: SectionProps) {
  const name = typeof title === 'string' ? title.replace(/\s*\(\d+\)$/, '') : null
  const [open, setOpen] = useState(() => !name || !foldedSections().has(name))
  const section = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const bodyId = useId()

  // A link into this section opens it (just this once) before the field is brought into view
  useEffect(() => {
    const el = section.current
    if (!el) return
    const reveal = () => {
      body.current?.removeAttribute('hidden')
      setOpen(true)
    }
    el.addEventListener(REVEAL_EVENT, reveal)
    return () => el.removeEventListener(REVEAL_EVENT, reveal)
  }, [])

  function toggle() {
    setOpen(!open)
    if (name) rememberFolded(name, open)
  }

  return (
    <section ref={section} className={`ed-section ed-section--folding ${open ? '' : 'is-folded'}`}>
      <div className="ed-section__head">
        <h3 className="ed-section__title">
          <button type="button" className="ed-section__toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
            <ChevronUpIcon size={16} className="ed-section__chevron" />
            {title}
          </button>
        </h3>
        {open && aside}
      </div>
      <div ref={body} id={bodyId} className="ed-section__body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}
