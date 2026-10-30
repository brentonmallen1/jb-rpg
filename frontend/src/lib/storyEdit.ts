import type { Choice, ChoiceKind, Condition, ConditionType, ConditionalText, ItemDef, MadLibField, Route, Scene, Story, StoryProblem } from '../types'
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

/** A new scene for this story, numbered after its last, with a title if one was given */
export function createScene(story: Story, title?: string): Scene {
  const scene = newScene(story.scenes.length + 1)
  return title ? { ...scene, title } : scene
}

export function addScene(story: Story, scene: Scene): Story {
  return { ...story, scenes: [...story.scenes, scene] }
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

/** Is a scene written enough to play? (Problems come from the server; this adds "unwritten".) */
export function sceneStatus(scene: Scene, problems: StoryProblem[]): { tone: 'problem' | 'draft' | 'ready'; label: string } {
  const own = problems.filter(p => p.scene_id === scene.id)
  if (own.some(p => p.severity === 'error')) return { tone: 'problem', label: 'Needs fixing before play' }
  if (own.length) return { tone: 'draft', label: own[0].message }
  const unwritten = !scene.base_text.trim() ||
    (scene.is_finale ? !scene.victory_text?.trim() || !scene.defeat_text?.trim()
      : scene.choices.some(c => !c.display_text.trim() || !c.result_text.trim()))
  return unwritten ? { tone: 'draft', label: 'Still being written' } : { tone: 'ready', label: 'Written' }
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

/** The finale's texts that can hold {item_text:Name} placeholders */
const FINALE_TEXTS = ['finale_setup_text', 'victory_text', 'defeat_text'] as const

function mapFinaleTexts(scenes: Scene[], change: (text: string) => string): Scene[] {
  return scenes.map(s => {
    const next = { ...s }
    for (const key of FINALE_TEXTS) if (s[key]) next[key] = change(s[key])
    return next
  })
}

/** Rename an item. References use its id, so only the {item_text:Name} placeholders in finale text change. */
export function renameItem(story: Story, id: string, name: string): Story {
  const old = findItem(story, id)?.name
  const renamed = patchItem(story, id, { name })
  if (old === undefined || old === name) return renamed
  return { ...renamed, scenes: mapFinaleTexts(renamed.scenes, text => text.split(`{item_text:${old}}`).join(`{item_text:${name}}`)) }
}

const usesItem = (c: Condition, id: string) => c.type === 'item_held' && c.item_id === id

/** Where a condition lives: a line that changes, a route, or a door's lock. */
export type ConditionPlace = { scene: Scene | null; what: 'line' | 'route' | 'lock'; index: number; condition: Condition }

/** Every condition in the story (scenes in order, then the prologue's lines). */
export function storyConditions(story: Story): ConditionPlace[] {
  const found: ConditionPlace[] = []
  for (const scene of story.scenes) {
    scene.conditional_text.forEach((ct, index) => found.push({ scene, what: 'line', index, condition: ct.condition }))
    scene.routes?.forEach((r, index) => found.push({ scene, what: 'route', index, condition: r.condition }))
    scene.requires?.forEach((condition, index) => found.push({ scene, what: 'lock', index, condition }))
  }
  story.opening_scene?.conditional_text.forEach((ct, index) => found.push({ scene: null, what: 'line', index, condition: ct.condition }))
  return found
}

/** The story without the lines, routes and locks whose condition fails `keep`. */
function filterConditions(story: Story, keep: (c: Condition) => boolean): Story {
  return {
    ...story,
    scenes: story.scenes.map(s => ({
      ...s,
      conditional_text: s.conditional_text.filter(ct => keep(ct.condition)),
      routes: s.routes?.filter(r => keep(r.condition)),
      requires: s.requires?.filter(keep),
    })),
    opening_scene: story.opening_scene && {
      ...story.opening_scene,
      conditional_text: story.opening_scene.conditional_text.filter(ct => keep(ct.condition)),
    },
  }
}

/** Remove an item and everything that points at it: the choices that gave it keep their kind but no item. */
export function deleteItem(story: Story, id: string): Story {
  const old = findItem(story, id)?.name
  const unchecked = filterConditions(story, c => !usesItem(c, id))
  const scenes = unchecked.scenes.map(s => {
    const itemTexts = { ...(s.item_texts ?? {}) }
    delete itemTexts[id]
    return { ...s, item_texts: itemTexts, choices: s.choices.map(c => (c.item_id === id ? { ...c, item_id: null } : c)) }
  })
  return {
    ...unchecked,
    items: storyItems(story).filter(i => i.id !== id),
    scenes: old ? mapFinaleTexts(scenes, text => text.split(`{item_text:${old}}`).join('')) : scenes,
  }
}

const routeDetail = (story: Story, target?: string) => (target === END ? 'then the story ends' : `then ${sceneTitle(story, target)}`)

/** One place an item is used; `focus` names the field in the scene's panel (see data-focus) */
export type ItemUse = { scene: Scene | null; what: 'choice' | 'line' | 'route' | 'lock' | 'finale'; index: number; detail: string; focus: string }

/** Where an item is given (choices) and where it's checked (lines, routes, locks, finale texts). */
export function itemUses(story: Story, id: string): { given: ItemUse[]; checked: ItemUse[] } {
  const given: ItemUse[] = []
  const checked: ItemUse[] = []
  for (const scene of story.scenes) {
    scene.choices.forEach((c, i) => {
      if (c.kind === 'item' && c.item_id === id) given.push({ scene, what: 'choice', index: i, detail: c.display_text, focus: `choice-${i}` })
    })
  }
  for (const place of storyConditions(story)) {
    if (!usesItem(place.condition, id)) continue
    const { scene, what, index } = place
    const detail = what === 'line'
      ? (scene ? scene.conditional_text : story.opening_scene?.conditional_text ?? [])[index]?.text ?? ''
      : what === 'route'
        ? routeDetail(story, scene?.routes?.[index]?.target)
        : 'the door stays locked without it'
    checked.push({ scene, what, index, detail, focus: `${what}-${index}` })
  }
  for (const scene of story.scenes) {
    const texts = scene.item_texts?.[id]
    if (texts) checked.push({ scene, what: 'finale', index: 0, detail: texts.victory || texts.defeat || '', focus: `item-ending-${id}` })
  }
  return { given, checked }
}

// ---------------------------------------------------------------------------
// Conditions: the words for them, shared by the pickers and the sentences that describe them
// ---------------------------------------------------------------------------

export const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'item_held', label: 'they hold an item' },
  { value: 'scene_outcome', label: 'an earlier scene went a way' },
  { value: 'hp', label: "the hero's health" },
  { value: 'level', label: "the hero's level" },
  { value: 'items', label: 'the number of items carried' },
]

/** A fresh condition of a type, keeping nothing that doesn't belong to it. */
export function conditionOfType(type: ConditionType): Condition {
  if (type === 'item_held') return { type }
  if (type === 'scene_outcome') return { type, outcome: 'item' }
  return { type, op: type === 'hp' ? 'lte' : 'gte', value: 1 }
}

export const OUTCOME_WORDS: Record<ChoiceKind, string> = { damage: 'they lost a life', item: 'they found an item', level: 'they grew stronger' }

export const OP_WORDS = { lte: 'at most', gte: 'at least', eq: 'exactly' } as const

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

/** Door stories: where a room goes back to. Never stored; it's what a door story does by default. */
export const DOORS = 'doors'

export function sceneTitle(story: Story, id: string | null | undefined): string {
  if (id === END) return 'The end'
  if (id === DOORS) return 'Back to the doors'
  const scene = story.scenes.find(s => s.id === id)
  return scene ? scene.title || 'Untitled scene' : 'A scene that no longer exists'
}

/** Where a scene goes when nothing in it says otherwise: the doors, the next scene in the list, or END
 * (engine.default_next, on the server) */
export function defaultNext(story: Story, scene: Scene): string {
  if (story.settings.non_linear) return DOORS
  return story.scenes[story.scenes.findIndex(s => s.id === scene.id) + 1]?.id ?? END
}

/** Where a scene goes when nothing in it says otherwise, in words. */
export function defaultNextTitle(story: Story, scene: Scene): string {
  const next = defaultNext(story, scene)
  return next === DOORS || next === END ? sceneTitle(story, next) : `Next in the list: ${sceneTitle(story, next)}`
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

// ---------------------------------------------------------------------------
// Routes, items on choices, and where the Flow view's nodes sit
// ---------------------------------------------------------------------------

export function addRoute(story: Story, sceneId: string, route: Route = { condition: { type: 'item_held' }, target: '' }): Story {
  return patchScene(story, sceneId, sc => ({ ...sc, routes: [...(sc.routes ?? []), route] }))
}

export function removeRoute(story: Story, sceneId: string, index: number): Story {
  return patchScene(story, sceneId, sc => ({ ...sc, routes: (sc.routes ?? []).filter((_, j) => j !== index) }))
}

/** A choice now finds this item */
export function giveItem(story: Story, sceneId: string, choiceIndex: number, itemId: string): Story {
  return patchScene(story, sceneId, sc => ({
    ...sc,
    choices: sc.choices.map((c, i) => (i === choiceIndex ? { ...c, kind: 'item', item_id: itemId } : c)),
  }))
}

/** A route now asks whether the party holds this item */
export function checkItem(story: Story, sceneId: string, routeIndex: number, itemId: string): Story {
  return patchScene(story, sceneId, sc => ({
    ...sc,
    routes: (sc.routes ?? []).map((r, i) => (i === routeIndex ? { ...r, condition: { type: 'item_held', item_id: itemId } } : r)),
  }))
}

/** Remember where the author put a node on the Flow view */
export function moveNode(story: Story, id: string, position: { x: number; y: number }): Story {
  return { ...story, layout: { ...(story.layout ?? {}), [id]: { x: Math.round(position.x), y: Math.round(position.y) } } }
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
