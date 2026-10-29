import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../hooks/api'
import { useGame } from '../context/useGame'
import { ConfirmDialog } from './Modal'

/**
 * In the header of the Library and the Editor: a game is in progress. Pick it back up
 * (taking it over if it's run from another tab or device) or end it.
 */
export function NowPlaying() {
  const navigate = useNavigate()
  const { state, isStoryteller, sessionElsewhere, isInitializing, isValidatingToken, resumeSession, endSession } = useGame()
  const [title, setTitle] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const menu = useRef<HTMLDetailsElement>(null)
  const storyId = state?.story_id

  useEffect(() => {
    if (!storyId) return
    api.getStories().then(stories => setTitle(stories.find(s => s.id === storyId)?.title ?? null)).catch(() => {})
  }, [storyId])

  if (isInitializing || isValidatingToken || !(state || sessionElsewhere)) return null

  async function act(action: () => Promise<void>, failure: string) {
    setError(null)
    try {
      await action()
      if (menu.current) menu.current.open = false
    } catch {
      setError(failure)
    }
  }

  // A game run from another tab or device: become its storyteller first
  const takeOver = async () => { if (!isStoryteller) await resumeSession() }

  return (
    <>
      <details className="menu now-playing-chip" ref={menu}>
        <summary className="now-playing-chip__summary" title={isStoryteller ? 'A game is in progress' : 'A game is in progress on another tab or device'}>
          <span className="now-playing-chip__dot" aria-hidden="true" />
          <span className="now-playing-chip__label">{isStoryteller ? 'Now playing' : 'Playing elsewhere'}</span>
          {title && <span className="now-playing-chip__title">{title}</span>}
        </summary>
        <div className="menu__panel">
          <button onClick={() => act(async () => { await takeOver(); navigate('/run') }, 'Could not pick the game back up')}>
            {isStoryteller ? 'Return to the table' : 'Take over and continue'}
          </button>
          <button className="menu__danger" onClick={() => setConfirmEnd(true)}>End the game…</button>
          {error && <p className="now-playing-chip__error" role="alert">{error}</p>}
        </div>
      </details>

      <ConfirmDialog
        isOpen={confirmEnd}
        onConfirm={() => { setConfirmEnd(false); act(async () => { await takeOver(); await endSession() }, 'Could not end the game') }}
        onCancel={() => setConfirmEnd(false)}
        title="End the game?"
        message={`${title ? `“${title}”` : 'The game in progress'} ends for everyone: players are disconnected and the story starts over next time.`}
        confirmText="End the game"
        variant="danger"
      />
    </>
  )
}
