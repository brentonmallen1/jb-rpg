import type { Story, StorySummary, GameState, StoryProblem } from '../types'

const SESSION_TOKEN_KEY = 'jb_rpg_session_token'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Storyteller token (sessionStorage: one per tab)
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

// Every API call goes through here: JSON in/out, storyteller token attached,
// and failures surface the server's `detail` message.
async function request<T>(path: string, { body, method }: { body?: unknown; method?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getSessionToken()
  if (token) headers['X-Session-Token'] = token
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(path, {
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const detail = typeof data?.detail === 'string' ? data.detail : `Request failed (${res.status})`
    throw new ApiError(res.status, detail)
  }
  return res.json()
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { body })

// Config and session lookup
export const getConfig = () => request<{ base_url: string | null }>('/api/config')

// Is a session active, and does sessionId match it? (never reveals the id)
export const checkSession = (sessionId?: string | null) =>
  request<{ active: boolean; valid: boolean }>(
    `/api/session/check${sessionId ? `?s=${encodeURIComponent(sessionId)}` : ''}`
  )

export const validateToken = () =>
  request<{ valid: boolean; is_storyteller: boolean }>('/api/state/validate-token')

// Stories
export const getStories = () => request<StorySummary[]>('/api/stories')
export const getStory = (id: string) => request<Story>(`/api/stories/${id}`)
export const getStoryProblems = (id: string) => request<{ problems: StoryProblem[] }>(`/api/stories/${id}/problems`)
export const createStory = (title: string) => post<Story>('/api/stories', { title })
export const importStory = (story: unknown) => post<Story>('/api/stories/import', story)
export const updateStory = (id: string, story: Story) =>
  request<Story>(`/api/stories/${id}`, { method: 'PUT', body: story })
export const deleteStory = (id: string) => request<void>(`/api/stories/${id}`, { method: 'DELETE' })

// Session lifecycle. start/resume hand back a new storyteller token.
async function takeControl(path: string, body?: unknown) {
  const data = await post<{ state: GameState; token: string }>(path, body)
  setSessionToken(data.token)
  return data
}

export const startSession = (storyId: string, force = false) =>
  takeControl('/api/state/start', { story_id: storyId, force })
export const resumeSession = () => takeControl('/api/state/resume')

export async function restart(): Promise<void> {
  await post('/api/state/restart')
  setSessionToken(null)
}

// The story as it was when the session started
export const getSessionStory = () => request<Story>('/api/state/story')

// Storyteller actions
export const submitMadlib = (answer: string) => post<GameState>('/api/state/madlib', { answer })
export const madlibBack = () => post<GameState>('/api/state/madlib-back')
export const proceedFromCharacter = () => post<GameState>('/api/state/proceed-from-character')
export const openingChoice = (choiceIndex: number | null) =>
  post<GameState>('/api/state/opening-choice', { choice_index: choiceIndex })
export const revealChoices = (showToPlayers = true) =>
  post<GameState>(`/api/state/reveal-choices?show_to_players=${showToPlayers}`)
export const makeChoice = (choiceIndex: number) => post<GameState>('/api/state/choice', { choice_index: choiceIndex })
export const goBack = () => post<GameState>('/api/state/back')
export const selectScene = (sceneId: string, revisit = false) =>
  post<GameState>('/api/state/select-scene', { scene_id: sceneId, revisit })
export const finish = (outcome: 'victory' | 'defeat') => post<GameState>('/api/state/finish', { outcome })
export const revealOutcome = () => post<GameState>('/api/state/reveal-outcome')

// Export story as JSON file download
export function downloadStoryAsJson(story: Story): void {
  const json = JSON.stringify(story, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const filename = story.title
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
  a.download = `${filename || story.id}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
