import type { GameState, HistoryEntry, Scene, Story } from '../types'

export function sceneName(scene: Pick<Scene, 'title' | 'display_name'>): string {
  return scene.display_name || scene.title
}

export type ProgressStep = { id: string; name: string; status: 'played' | 'current' | 'upcoming'; finale: boolean }

/** Every scene in story order, marked played / current / upcoming (storyteller-only). */
export function storyProgress(story: Story, state: GameState): ProgressStep[] {
  const played = new Set(state.history.map(h => h.scene_id))
  return story.scenes.map(scene => ({
    id: scene.id,
    name: sceneName(scene),
    finale: !!scene.is_finale,
    status:
      scene.id === state.current_scene_id && state.status === 'running' ? 'current' :
      played.has(scene.id) ? 'played' : 'upcoming',
  }))
}

/** "The Apothecary", "found Vlad's Mystery Potion": the last choice made, for the recap line. */
export function recap(story: Story, entry: HistoryEntry | undefined): { scene: string; outcome: string } | null {
  if (!entry) return null
  const scene = story.scenes.find(s => s.id === entry.scene_id)
  if (!scene) return null
  const outcome =
    entry.outcome === 'damage' ? 'lost a life' :
    entry.outcome === 'item' ? `found ${entry.item_name ?? 'an item'}` :
    'grew stronger'
  return { scene: sceneName(scene), outcome }
}
