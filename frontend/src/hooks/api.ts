import type { AudioFile, Emblem, Story, StorySummary, GameState, PlayerRef, StoryProblem, GameOptions } from '../types'

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
    // Signed out (or the login changed): back to the sign-in page, then here again
    if (res.status === 401 && detail === SIGN_IN_REQUIRED && window.location.pathname !== '/login') {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`)
    }
    throw new ApiError(res.status, detail)
  }
  return res.json()
}

const SIGN_IN_REQUIRED = 'Sign in required'  // the server's detail for admin APIs called while signed out

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

// Storyteller sign-in (a cookie; players never need it)
export const adminSession = () => request<{ signed_in: boolean; required: boolean }>('/api/admin/session')
export const login = (username: string, password: string) =>
  post<{ signed_in: boolean }>('/api/admin/login', { username, password })
export const logout = () => post<{ signed_in: boolean }>('/api/admin/logout')

// Stories
export const getStories = () => request<StorySummary[]>('/api/stories')
export const getStory = (id: string) => request<Story>(`/api/stories/${id}`)
export const getStoryProblems = (id: string) => request<{ problems: StoryProblem[] }>(`/api/stories/${id}/problems`)
export const createStory = (title: string) => post<Story>('/api/stories', { title })
export const importStory = (story: unknown) => post<Story>('/api/stories/import', story)
export const duplicateStory = (id: string) => post<Story>(`/api/stories/${id}/duplicate`)
export const updateStory = (id: string, story: Story) =>
  request<Story>(`/api/stories/${id}`, { method: 'PUT', body: story })
export const deleteStory = (id: string) => request<void>(`/api/stories/${id}`, { method: 'DELETE' })

// Audio uploaded to a story (ambience loops and moment stings)
export const audioUrl = (storyId: string, name: string) => `/api/stories/${storyId}/audio/${encodeURIComponent(name)}`
export const listAudio = (storyId: string) => request<AudioFile[]>(`/api/stories/${storyId}/audio`)
export const deleteAudio = (storyId: string, name: string) => request<void>(audioUrl(storyId, name), { method: 'DELETE' })

export async function uploadAudio(storyId: string, file: File): Promise<AudioFile> {
  // The body is the file itself; names are tidied to what the server accepts
  const name = file.name.replace(/[^A-Za-z0-9 ._()'-]/g, '_').replace(/^[^A-Za-z0-9]+/, '')
  const res = await fetch(audioUrl(storyId, name), { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, typeof data?.detail === 'string' ? data.detail : `Upload failed (${res.status})`)
  }
  return res.json()
}

// Session lifecycle. start/resume hand back a new storyteller token.
async function takeControl(path: string, body?: unknown) {
  const data = await post<{ state: GameState; token: string }>(path, body)
  setSessionToken(data.token)
  return data
}

export const startSession = (storyId: string, force = false, { turnMode = 'storyteller', noFlashing = false }: GameOptions = {}) =>
  takeControl('/api/state/start', { story_id: storyId, force, turn_mode: turnMode, no_flashing: noFlashing })
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
// Real dice: the storyteller enters each roll (and can take back a typo)
export const recordRoll = (attempt: number, value: number) => post<GameState>('/api/state/record-roll', { attempt, value })
export const undoRoll = () => post<GameState>('/api/state/undo-roll')
export const offerRoll = (offered: boolean) => post<GameState>('/api/state/offer-roll', { offered })
// The digital d20: the server rolls. `attempt` is how many rolls the roller had seen; phones send their session id
export const roll = (attempt: number, sessionId?: string) => post<GameState>('/api/state/roll', { attempt, s: sessionId })

// Turns: who makes each choice
export const setDecider = (playerId: string | null) => post<GameState>('/api/state/decider', { player_id: playerId })
export const setNoFlashing = (noFlashing: boolean) => post<GameState>('/api/state/no-flashing', { no_flashing: noFlashing })
export const chooseCrest = (variant: number) => post<GameState>('/api/state/crest', { variant })
export const chooseEmblem = (input: string) => post<GameState>('/api/state/crest', { emblem: input })
// Three emblems for the hero from the emblem service (503 when it's down: draw the built-in crests)
export const emblemOptions = (round: number) => request<{ emblems: Emblem[] }>(`/api/state/emblems?round=${round}`)
export const removePlayer = (playerId: string) => request<GameState>(`/api/state/players/${playerId}`, { method: 'DELETE' })

// Player endpoints authenticate with the player's own token, not the storyteller's
async function asPlayer<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, typeof data?.detail === 'string' ? data.detail : `Request failed (${res.status})`)
  }
  return res.json()
}

export const joinSession = (sessionId: string, name: string) =>
  asPlayer<{ player: PlayerRef; token: string }>('/api/session/join', null, { method: 'POST', body: JSON.stringify({ s: sessionId, name }) })
export const whoAmI = (token: string) => asPlayer<PlayerRef>('/api/session/me', token)
export const castVote = (token: string, choiceIndex: number) =>
  asPlayer<{ status: string }>('/api/state/vote', token, { method: 'POST', body: JSON.stringify({ choice_index: choiceIndex }) })
export const proposeChoice = (token: string, choiceIndex: number | null) =>
  asPlayer<{ status: string }>('/api/state/propose', token, { method: 'POST', body: JSON.stringify({ choice_index: choiceIndex }) })

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
