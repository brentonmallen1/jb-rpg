import { useEffect, useRef, useState } from 'react'
import { TextArea } from './fields'

/** One long text the window can edit, from wherever it lives in the story. */
export interface WritingEntry {
  id: string
  group: string  // the rail's heading: "Read aloud", "After a choice", "The final roll"
  label: string
  sub?: string
  value: string
  onChange: (text: string) => void
  placeholder?: string
}

interface WritingDialogProps {
  title: string
  entries: WritingEntry[]
  /** The text to open on; null = closed */
  openId: string | null
  onClose: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** "about 40 seconds aloud", at a storyteller's pace (about 150 words a minute). */
function aloud(words: number): string {
  const seconds = Math.round((words / 150) * 60 / 5) * 5
  if (seconds < 60) return `about ${Math.max(seconds, 5)} seconds aloud`
  const minutes = Math.round(seconds / 30) / 2
  return `about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} aloud`
}

/**
 * A larger window for writing long text: the scene's texts in a rail, the chosen one in a wide
 * reading column. Edits go straight into the story, so autosave and undo work as in the panel.
 */
export function WritingDialog({ title, entries, openId, onClose }: WritingDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [currentId, setCurrentId] = useState(openId)
  const [openedWith, setOpenedWith] = useState(openId)
  if (openId !== openedWith) {
    // Opened again (or on another text): start on that text
    setOpenedWith(openId)
    setCurrentId(openId)
  }

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (openId && !el.open) el.showModal()
    if (!openId && el.open) el.close()
  }, [openId])

  const index = Math.max(0, entries.findIndex(e => e.id === currentId))
  const entry = entries[index]
  const words = entry?.value.trim() ? entry.value.trim().split(/\s+/).length : 0

  function move(step: number) {
    const next = entries[(index + step + entries.length) % entries.length]
    if (next) setCurrentId(next.id)
  }

  return (
    <dialog
      ref={dialog}
      className="writer"
      aria-labelledby="writer-title"
      onCancel={e => { e.preventDefault(); onClose() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={e => {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          move(e.key === 'ArrowDown' ? 1 : -1)
        }
      }}
    >
      {openId && entry && (
        <div className="writer__frame">
          <header className="writer__head">
            <div className="writer__title">
              <span className="stage-label">Writing</span>
              <h2 id="writer-title">{title}</h2>
            </div>
            <button type="button" className="s-btn" onClick={onClose}>Done</button>
          </header>

          <div className="writer__body">
            <nav className="writer__rail" aria-label="This scene's texts">
              {entries.map((e, i) => (
                <div key={e.id} className="writer__rail-item">
                  {e.group !== entries[i - 1]?.group && <span className="writer__group">{e.group}</span>}
                  <button
                    type="button"
                    className={`writer__text ${e.id === entry.id ? 'is-current' : ''}`}
                    aria-current={e.id === entry.id || undefined}
                    onClick={() => setCurrentId(e.id)}
                  >
                    <span className="writer__text-label">{e.label}</span>
                    {e.sub && <span className="writer__text-sub">{e.sub}</span>}
                  </button>
                </div>
              ))}
              <span className="writer__keys">⌥↑ ⌥↓ move between texts</span>
            </nav>

            <section className="writer__page">
              <div className="writer__column">
                <label className="ed-label" htmlFor="writer-text">
                  {entry.label}
                  {entry.sub && <span className="ed-hint">{entry.sub}</span>}
                </label>
                <TextArea
                  key={entry.id}
                  id="writer-text"
                  className="writer__textarea"
                  value={entry.value}
                  placeholder={entry.placeholder}
                  onChange={e => entry.onChange(e.target.value)}
                  autoFocus
                />
              </div>
              <footer className="writer__foot">
                <span>Type <kbd>{'{'}</kbd> for the hero’s answers · Saved as you type · {isMac ? '⌘' : 'Ctrl+'}Z works here too</span>
                <span>{words} {words === 1 ? 'word' : 'words'}{words > 0 && ` · ${aloud(words)}`}</span>
              </footer>
            </section>
          </div>
        </div>
      )}
    </dialog>
  )
}
