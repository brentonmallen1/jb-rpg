import type { Scene, Story } from '../types'
import { defaultNext, isDoor } from './storyEdit'

/**
 * How hard a story is on the party's lives. Players never see what a choice will do, so every pick
 * is blind: a scene where one choice in three costs a life costs one a third of the time. Walking
 * the way through the story that risks the most, the chances add up to how many lives a table
 * loses on average and how often it runs out.
 */

/** Starting lives the editor allows (the health meter switches to a count above 10) */
export const MIN_LIVES = 1
export const MAX_LIVES = 20
const DEFAULT_LIVES = 3

/** A story is fair when a table picking blind runs out in at most this share of games */
const FAIR = 0.4

export type DifficultyLevel = 'gentle' | 'fair' | 'hard' | 'brutal'

export interface Difficulty {
  /** Scenes on the riskiest way through where a choice can cost a life */
  risky: number
  /** Lives a table picking blind loses on that way through, on average */
  expected: number
  /** The chance a table picking blind runs out, with the story's starting lives */
  defeat: number
  level: DifficultyLevel
  /** The fewest starting lives (at least 3) that make it fair */
  suggested: number
}

export function storyDifficulty(story: Story): Difficulty {
  const chances = riskiestRun(story)
  const lives = story.settings.starting_hp
  const defeat = defeatChance(chances, lives)
  let suggested = DEFAULT_LIVES
  while (suggested < MAX_LIVES && defeatChance(chances, suggested) > FAIR) suggested++
  return {
    risky: chances.filter(p => p > 0).length,
    expected: chances.reduce((sum, p) => sum + p, 0),
    defeat,
    level: defeat <= 0.15 ? 'gentle' : defeat <= FAIR ? 'fair' : defeat <= 0.65 ? 'hard' : 'brutal',
    suggested,
  }
}

/** The chance of losing at least `lives` lives, one scene at a time (each with its own chance) */
export function defeatChance(chances: number[], lives: number): number {
  // lost[k]: the chance of having lost exactly k so far; the last slot holds "all of them"
  let lost: number[] = Array.from({ length: lives + 1 }, (_, k) => (k === 0 ? 1 : 0))
  for (const p of chances) {
    const next = lost.map(() => 0)
    lost.forEach((q, k) => {
      if (k === lives) next[k] += q
      else {
        next[k] += q * (1 - p)
        next[k + 1] += q * p
      }
    })
    lost = next
  }
  return lost[lives]
}

/** A scene's chance of costing a life when the table picks blind */
function sceneRisk(scene: Scene): number {
  if (scene.is_finale || !scene.choices.length) return 0
  return scene.choices.filter(c => c.kind === 'damage').length / scene.choices.length
}

/** Each scene's chance of costing a life, along the way through the story that risks the most.
 * Door stories play every door (and the rooms behind it); others follow one path from the start.
 * The server walks the same way (engine.riskiest_run) to warn when the lives can't run out. */
function riskiestRun(story: Story): number[] {
  const byId = new Map(story.scenes.map(s => [s.id, s]))
  const best = new Map<string, { total: number; chances: number[] }>()
  const walking = new Set<string>()

  function from(id: string): { total: number; chances: number[] } {
    const scene = byId.get(id)
    if (!scene || walking.has(id)) return { total: 0, chances: [] }  // the end, the doors, or a loop
    const known = best.get(id)
    if (known) return known
    walking.add(id)
    let after = { total: 0, chances: [] as number[] }
    for (const next of nextScenes(story, scene)) {
      const run = from(next)
      if (run.total > after.total || (run.total === after.total && run.chances.length > after.chances.length)) after = run
    }
    walking.delete(id)
    const risk = sceneRisk(scene)
    const run = { total: risk + after.total, chances: [risk, ...after.chances] }
    best.set(id, run)
    return run
  }

  if (story.settings.non_linear) return story.scenes.filter(s => isDoor(story, s)).flatMap(s => from(s.id).chances)
  const starts = story.opening_scene?.choices.length
    ? story.opening_scene.choices.map(c => c.target_scene_id || story.scenes[0]?.id)
    : [story.scenes[0]?.id]
  return starts.filter((id): id is string => !!id).map(from).reduce((a, b) => (b.total > a.total ? b : a), { total: 0, chances: [] }).chances
}

/** Where a scene can lead: its choices' own links, and (for choices without one) its routes and "otherwise" */
function nextScenes(story: Story, scene: Scene): string[] {
  if (scene.is_finale || !scene.choices.length) return []
  const own = scene.choices.map(c => c.next_scene_id).filter((id): id is string => !!id)
  if (own.length === scene.choices.length && own.length) return [...new Set(own)]
  const routes = (scene.routes ?? []).map(r => r.target).filter(Boolean)
  return [...new Set([...own, ...routes, scene.next || defaultNext(story, scene)])]
}
