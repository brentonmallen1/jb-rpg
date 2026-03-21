import type { Story, StorySummary, GameState } from '../types'

const SESSION_TOKEN_KEY = 'jb_rpg_session_token'

// Config endpoint
export async function getConfig(): Promise<{ base_url: string | null; session_id: string | null }> {
  const res = await fetch('/api/config')
  if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`)
  return res.json()
}

// Get/set session token
export function getSessionToken(): string | null {
  return sessionStorage.getItem(SESSION_TOKEN_KEY)
}

export function setSessionToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  } else {
    sessionStorage.removeItem(SESSION_TOKEN_KEY)
  }
}

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  const token = getSessionToken()
  if (token) {
    headers['X-Session-Token'] = token
  }
  return headers
}

// Story endpoints
export async function getStories(): Promise<StorySummary[]> {
  const res = await fetch('/api/stories')
  if (!res.ok) throw new Error(`Failed to fetch stories: ${res.status}`)
  return res.json()
}

export async function getStory(id: string): Promise<Story> {
  const res = await fetch(`/api/stories/${id}`)
  if (!res.ok) throw new Error('Story not found')
  return res.json()
}

export async function createStory(title: string): Promise<Story> {
  const res = await fetch('/api/stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error(`Failed to create story: ${res.status}`)
  return res.json()
}

export async function updateStory(id: string, story: Story): Promise<Story> {
  const res = await fetch(`/api/stories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(story),
  })
  if (!res.ok) throw new Error(`Failed to update story: ${res.status}`)
  return res.json()
}

export async function deleteStory(id: string): Promise<void> {
  const res = await fetch(`/api/stories/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete story: ${res.status}`)
}

// State endpoints
export async function getState(): Promise<{ state: GameState | null; resolved: unknown }> {
  const res = await fetch('/api/state')
  if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`)
  return res.json()
}

export async function validateToken(): Promise<{ valid: boolean; is_storyteller: boolean }> {
  const headers: HeadersInit = {}
  const token = getSessionToken()
  if (token) {
    headers['X-Session-Token'] = token
  }
  const res = await fetch('/api/state/validate-token', { headers })
  return res.json()
}

export async function startSession(storyId: string): Promise<{ state: GameState; token: string }> {
  const res = await fetch('/api/state/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ story_id: storyId }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to start session')
  }
  const data = await res.json()
  setSessionToken(data.token)
  return { state: data.state, token: data.token }
}

export async function submitMadlib(answer: string): Promise<GameState> {
  const res = await fetch('/api/state/madlib', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ answer }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to submit madlib')
  }
  return res.json()
}

export async function makeChoice(choiceIndex: number): Promise<GameState> {
  const res = await fetch('/api/state/choice', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ choice_index: choiceIndex }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to make choice')
  }
  return res.json()
}

export async function goBack(): Promise<GameState> {
  const res = await fetch('/api/state/back', {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to go back')
  }
  return res.json()
}

export async function finish(outcome: 'victory' | 'defeat'): Promise<GameState> {
  const res = await fetch('/api/state/finish', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ outcome }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to finish')
  }
  return res.json()
}

export async function restart(): Promise<void> {
  const res = await fetch('/api/state/restart', { method: 'POST' })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to restart')
  }
  setSessionToken(null)
}

export async function revealChoices(showToPlayers: boolean = true): Promise<GameState> {
  const url = `/api/state/reveal-choices?show_to_players=${showToPlayers}`
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to reveal choices')
  }
  return res.json()
}

export async function selectScene(sceneId: string): Promise<GameState> {
  const res = await fetch('/api/state/select-scene', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ scene_id: sceneId }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to select scene')
  }
  return res.json()
}

export async function openingChoice(choiceIndex: number | null): Promise<GameState> {
  const res = await fetch('/api/state/opening-choice', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ choice_index: choiceIndex }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Failed to make opening choice')
  }
  return res.json()
}
