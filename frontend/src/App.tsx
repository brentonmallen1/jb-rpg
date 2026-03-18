import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GameProvider } from './context/GameContext'
import Library from './pages/Library'
import Editor from './pages/Editor'
import Run from './pages/Run'
import Player from './pages/Player'

// Import base CSS and themes
import './styles/base.css'

function App() {
  return (
    <GameProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/editor/:storyId" element={<Editor />} />
          <Route path="/run" element={<Run />} />
          <Route path="/player" element={<Player />} />
        </Routes>
      </BrowserRouter>
    </GameProvider>
  )
}

export default App
