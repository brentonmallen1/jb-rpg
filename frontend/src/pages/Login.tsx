import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGame } from '../context/useGame'
import * as api from '../hooks/api'
import { MoonIcon, SunIcon } from '../components/Icons'
import '../styles/stage.css'
import '../styles/pages/library.css'

/** Only same-site paths, so a crafted link can't bounce the storyteller elsewhere after signing in. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/'
}

/** The storyteller's sign-in. Players never see this: they join from the link they're sent. */
export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { toggleColorMode, colorMode, setCurrentStory } = useGame()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => setCurrentStory(null), [setCurrentStory])

  // Already signed in (or sign-in is switched off): straight through
  useEffect(() => {
    let cancelled = false
    api.adminSession()
      .then(s => { if (!cancelled && s.signed_in) navigate(next, { replace: true }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [navigate, next])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password || pending) return
    setPending(true)
    setError(null)
    try {
      await api.login(username, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
      setPassword('')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="stage library">
      <header className="stage__bar">
        <span className="library__wordmark"><img src="/favicon.svg" alt="" width="26" height="26" />J&amp;B’s RPG</span>
        <div className="stage__tools">
          <button className="icon-btn" onClick={toggleColorMode} aria-label={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}>
            {colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main className="login">
        <form className="login__form" onSubmit={submit}>
          <div className="eyebrow">For the storyteller</div>
          <h1 className="stage-title login__title">Sign in to run the table</h1>
          <p className="login__lede">Players don’t need this. They join from the link you share when the game starts.</p>

          <label className="login__field">
            <span>Username</span>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="login__field">
            <span>Password</span>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>

          {error && <p className="login__error" role="alert">{error}</p>}

          <button type="submit" className="btn login__submit" disabled={pending || !username || !password}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>

          <details className="login__help">
            <summary>Can’t find the login?</summary>
            <p>
              It’s whatever <code>ADMIN_USER</code> and <code>ADMIN_PASSWORD</code> are set to on the server.
              If they aren’t set, one was made up the first time the server ran and printed in the server log
              that one time. Lost it? Delete <code>admin.json</code> in the data folder and restart the server
              for a new one.
            </p>
          </details>
        </form>
      </main>
    </div>
  )
}
