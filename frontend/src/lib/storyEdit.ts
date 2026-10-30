import type { Choice, Condition, ConditionalText, ItemDef, MadLibField, Scene, Story } from '../types'
import { END } from '../types'

/** Pure helpers for editing a story: each returns a new story. */

export const KIND_LABEL = { damage: 'Costs a life', item: 'Finds an item', level: 'Grows stronger' } as const

export function newChoices(): Choice[] {
  return [
    { kind: 'damage', display_text: '', result_text: '', amount: 1 },
    { kind: 'item', display_text: '', result_text: '', amount: 1 },
    { kind: 'level', display_text: '', result_text: '', amount: 1 },
  ]
}

export function newScene(number: number): Scene {
  return {
    id: crypto.randomUUID().slice(0, 8),
    title: `Scene ${number}`,
    base_text: '',
    choices: newChoices(),
    conditional_text: [],
  }
}

export function newCondition(): ConditionalText {
  return { condition: { type: 'hp', op: 'lte', value: 1 }, text: '' }
}

export function patchScene(story: Story, sceneId: string, patch: Partial<Scene> | ((scene: Scene) => Scene)): Story {
  return {
    ...story,
    scenes: story.scenes.map(s => (s.id !== sceneId ? s : typeof patch === 'function' ? patch(s) : { ...s, ...patch })),
  }
}

export function moveSceneTo(story: Story, sceneId: string, toIndex: number): Story {
  const from = story.scenes.findIndex(s => s.id === sceneId)
  if (from < 0) return story
  const scenes = [...story.scenes]
  const [scene] = scenes.splice(from, 1)
  scenes.splice(Math.max(0, Math.min(toIndex, scenes.length)), 0, scene)
  return { ...story, scenes }
}

// ---------------------------------------------------------------------------
// Items: one catalogue (story.items); choices, conditions and finale texts point at an item's id
// ---------------------------------------------------------------------------

export function storyItems(story: Story): ItemDef[] {
  return story.items ?? []
}

export function findItem(story: Story, id: string | null | undefined): ItemDef | undefined {
  return id ? storyItems(story).find(i => i.id === id) : undefined
}

/** The choice with its item's name, icon and description filled in from the catalogue, for display. */
export function choiceWithItem(story: Story, choice: Choice): Choice {
  const item = choice.kind === 'item' ? findItem(story, choice.item_id) : undefined
  return item ? { ...choice, item_name: item.name, item_icon: item.icon, item_description: item.description } : choice
}

/** An id for a new item (it stays the same however the item is renamed). */
export function newItemId(story: Story, name: string): string {
  const taken = new Set(storyItems(story).map(i => i.id))
  const base = 'item_' + (name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'thing')
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`
  return id
}

export function addItem(story: Story, item: ItemDef): Story {
  return { ...story, items: [...storyItems(story), item] }
}

export function patchItem(story: Story, id: string, patch: Partial<ItemDef>): Story {
  return { ...story, items: storyItems(story).map(i => (i.id === id ? { ...i, ...patch } : i)) }
}

/** Rename an item. References use its id, so only the {item_text:Name} placeholders in finale text change. */
export function renameItem(story: Story, id: string, name: string): Story {
  const old = findItem(story, id)?.name
  const renamed = patchItem(story, id, { name })
  if (old === undefined || old === name) return renamed
  const swap = (text?: string) => text?.split(`{item_text:${old}}`).join(`{item_text:${name}}`)
  return {
    ...renamed,
    scenes: renamed.scenes.map(s => (s.is_finale ? { ...s, victory_text: swap(s.victory_text), defeat_text: swap(s.defeat_text), finale_setup_text: swap(s.finale_setup_text) } : s)),
  }
}

const usesItem = (c: Condition, id: string) => c.type === 'item_held' && c.item_id === id

/** Remove an item and everything that points at it: the choices that gave it keep their kind but no item. */
export function deleteItem(story: Story, id: string): Story {
  const old = findItem(story, id)?.name
  const drop = (text?: string) => (old ? text?.split(`{item_text:${old}}`).join('') : text)
  return {
    ...story,
    items: storyItems(story).filter(i => i.id !== id),
    scenes: story.scenes.map(s => {
      const itemTexts = { ...(s.item_texts ?? {}) }
      delete itemTexts[id]
      return {
        ...s,
        choices: s.choices.map(c => (c.item_id === id ? { ...c, item_id: null } : c)),
        conditional_text: s.conditional_text.filter(ct => !usesItem(ct.condition, id)),
        routes: s.routes?.filter(r => !usesItem(r.condition, id)),
        requires: s.requires?.filter(c => !usesItem(c, id)),
        item_texts: itemTexts,
        victory_text: drop(s.victory_text),
        defeat_text: drop(s.defeat_text),
      }
    }),
    opening_scene: story.opening_scene && {
      ...story.opening_scene,
      conditional_text: story.opening_scene.conditional_text.filter(ct => !usesItem(ct.condition, id)),
    },
  }
}

export type ItemUse = { scene: Scene | null; what: 'choice' | 'line' | 'route' | 'lock' | 'finale'; index: number; detail: string }

/** Where an item is given (choices) and where it's checked (lines, routes, locks, finale texts). */
export function itemUses(story: Story, id: string): { given: ItemUse[]; checked: ItemUse[] } {
  const given: ItemUse[] = []
  const checked: ItemUse[] = []
  for (const scene of story.scenes) {
    scene.choices.forEach((c, i) => {
      if (c.kind === 'item' && c.item_id === id) given.push({ scene, what: 'choice', index: i, detail: c.display_text })
    })
    scene.conditional_text.forEach((ct, i) => {
      if (usesItem(ct.condition, id)) checked.push({ scene, what: 'line', index: i, detail: ct.text })
    })
    scene.routes?.forEach((r, i) => {
      if (usesItem(r.condition, id)) checked.push({ scene, what: 'route', index: i, detail: r.target === END ? 'then the story ends' : `then ${sceneTitle(story, r.target)}` })
    })
    scene.requires?.forEach((c, i) => {
      if (usesItem(c, id)) checked.push({ scene, what: 'lock', index: i, detail: 'the door stays locked without it' })
    })
    const texts = scene.item_texts?.[id]
    if (texts) checked.push({ scene, what: 'finale', index: 0, detail: texts.victory || texts.defeat || '' })
  }
  story.opening_scene?.conditional_text.forEach((ct, i) => {
    if (usesItem(ct.condition, id)) checked.push({ scene: null, what: 'line', index: i, detail: ct.text })
  })
  return { given, checked }
}

const OP_WORDS = { lte: 'at most', gte: 'at least', eq: 'exactly' } as const
const OUTCOME_WORDS = { damage: 'they lost a life', item: 'they found an item', level: 'they grew stronger' } as const

/** A condition as a phrase: "they hold the Climbing Rope", "health is at most 1". */
export function describeCondition(story: Story, c: Condition): string {
  switch (c.type) {
    case 'item_held': return `they hold ${findItem(story, c.item_id)?.name ?? 'an item'}`
    case 'scene_outcome': return `in ${sceneTitle(story, c.scene_id)} ${c.outcome ? OUTCOME_WORDS[c.outcome] : 'something happened'}`
    default: {
      const stat = { hp: 'health', items: 'the number of items', level: 'level' }[c.type]
      return `${stat} is ${OP_WORDS[c.op ?? 'lte']} ${c.value ?? '?'}`
    }
  }
}

// ---------------------------------------------------------------------------
// Paths: where a scene leads
// ---------------------------------------------------------------------------

export function sceneTitle(story: Story, id: string | null | undefined): string {
  if (id === END) return 'The end'
  const scene = story.scenes.find(s => s.id === id)
  return scene ? scene.title || 'Untitled scene' : 'A scene that no longer exists'
}

/** Where a scene goes when nothing in it says otherwise, in words. */
export function defaultNextTitle(story: Story, scene: Scene): string {
  if (story.settings.non_linear) return 'Back to the doors'
  const i = story.scenes.findIndex(s => s.id === scene.id)
  const next = story.scenes[i + 1]
  return next ? `Next in the list: ${next.title || 'Untitled scene'}` : 'The end'
}

/** Where a scene goes after a choice that doesn't say (before any route), in words. */
export function afterSceneTitle(story: Story, scene: Scene): string {
  return scene.next ? sceneTitle(story, scene.next) : defaultNextTitle(story, scene)
}

/** Scenes that a choice, route or "after this scene" leads to. */
export function linkedSceneIds(story: Story): Set<string> {
  const linked = new Set<string>()
  for (const s of story.scenes) {
    s.choices.forEach(c => c.next_scene_id && linked.add(c.next_scene_id))
    s.routes?.forEach(r => r.target && linked.add(r.target))
    if (s.next) linked.add(s.next)
  }
  return linked
}

/** Door stories: a scene nothing leads to is a door; one something leads to is a room behind a door. */
export function isDoor(story: Story, scene: Scene): boolean {
  return !linkedSceneIds(story).has(scene.id)
}

/** Does anything in this scene say where the story goes (rather than down the list)? */
export function sceneBranches(scene: Scene): boolean {
  return !!scene.next || !!scene.routes?.length || scene.choices.some(c => c.next_scene_id)
}

/** Delete a scene, and clear every link that pointed at it (those then go wherever the story would by default). */
export function deleteScene(story: Story, id: string): Story {
  const unlink = (target?: string | null) => (target === id ? null : target)
  const layout = { ...(story.layout ?? {}) }
  delete layout[id]
  return {
    ...story,
    layout,
    scenes: story.scenes.filter(s => s.id !== id).map(s => ({
      ...s,
      next: unlink(s.next),
      choices: s.choices.map(c => (c.next_scene_id === id ? { ...c, next_scene_id: null } : c)),
      routes: s.routes?.filter(r => r.target !== id),
    })),
    opening_scene: story.opening_scene && {
      ...story.opening_scene,
      choices: story.opening_scene.choices.map(c => (c.target_scene_id === id ? { ...c, target_scene_id: undefined } : c)),
    },
  }
}

/** Template keys in order of first use: "{name} from {home}" -> ["name", "home"]. */
export function keysInTemplate(prompt: string): string[] {
  return [...new Set((prompt.match(/\{(\w+)\}/g) ?? []).map(m => m.slice(1, -1)))]
}

/** Questions matching the template's keys, keeping what was already written for each. */
export function fieldsForTemplate(prompt: string, existing: MadLibField[]): MadLibField[] {
  const byKey = new Map(existing.map(f => [f.key, f]))
  return keysInTemplate(prompt).map(key => byKey.get(key) ?? { key, label: '', hint: '' })
}

/** Scenes whose text, choices or conditions use {key}. */
export function scenesUsing(story: Story, key: string): Scene[] {
  const token = `{${key}}`
  return story.scenes.filter(s =>
    s.base_text.includes(token) ||
    s.choices.some(c => c.display_text.includes(token) || c.result_text.includes(token)) ||
    s.conditional_text.some(ct => ct.text.includes(token))
  )
}

/** Fill {key} with sample answers (or [key]) and {item_text:X} with that item's text, for previews. */
export function fillSample(
  text: string,
  samples: Record<string, string>,
  items?: { story: Story; texts: Scene['item_texts']; outcome: 'victory' | 'defeat'; collected: boolean },
): string {
  return text.replace(/\{([\w\s:'-]+)\}/g, (_, key: string) => {
    if (key.startsWith('item_text:')) {
      // Named in the text, keyed by id in item_texts
      const name = key.slice('item_text:'.length)
      const item = items && storyItems(items.story).find(i => i.name === name || i.id === name)
      const entry = item ? items?.texts?.[item.id] : undefined
      return items?.collected && entry ? entry[items.outcome] ?? '' : ''
    }
    return samples[key]?.trim() || `[${key}]`
  })
}
