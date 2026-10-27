import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect } from 'react'
import { GameProvider } from './context/GameContext'
import { ErrorBoundary } from './components'

// Import base CSS
import './styles/base.css'

// Lazy load route components for code splitting
// This creates separate chunks that load on-demand
const Library = lazy(() => import('./pages/Library'))
const Editor = lazy(() => import('./pages/Editor'))
const Run = lazy(() => import('./pages/Run'))
const Player = lazy(() => import('./pages/Player'))
// Dev-only effect tuning page; compiled out of production builds
const DevMoments = import.meta.env.DEV ? lazy(() => import('./pages/DevMoments')) : null

// Offline indicator banner
function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="offline-banner" role="alert" aria-live="assertive">
      You're offline. Some features may not work.
    </div>
  )
}

// Loading fallback component with animated dots
function PageLoader() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 'var(--space-md)'
      }}
      role="status"
      aria-live="polite"
    >
      <div className="page-loader" aria-hidden="true">
        <span />
      </div>
      <span className="visually-hidden">Loading...</span>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <BrowserRouter>
        <GameProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Library />} />
              <Route path="/editor/:storyId" element={<Editor />} />
              <Route path="/run" element={<Run />} />
              <Route path="/player/:sessionId" element={<Player />} />
              <Route path="/player" element={<Player />} />
              {DevMoments && <Route path="/dev/moments" element={<DevMoments />} />}
            </Routes>
          </Suspense>
        </GameProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
