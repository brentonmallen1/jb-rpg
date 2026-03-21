import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { GameProvider } from './context/GameContext'

// Import base CSS
import './styles/base.css'

// Lazy load route components for code splitting
// This creates separate chunks that load on-demand
const Library = lazy(() => import('./pages/Library'))
const Editor = lazy(() => import('./pages/Editor'))
const Run = lazy(() => import('./pages/Run'))
const Player = lazy(() => import('./pages/Player'))

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
    <GameProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/editor/:storyId" element={<Editor />} />
            <Route path="/run" element={<Run />} />
            <Route path="/player/:sessionId" element={<Player />} />
            <Route path="/player" element={<Player />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </GameProvider>
  )
}

export default App
