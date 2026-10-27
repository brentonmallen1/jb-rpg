import type { Choice, ConditionalText, MadLibField, Scene, Story } from '../types'

/** Pure helpers for editing a story: each returns a new story. */

export const KIND_LABEL = { damage: 'Costs a life', item: 'Finds an item', level: 'Grows stronger' } as const

export function newChoices(): Choice[] {
  return [
    { kind: 'damage', display_text: '', result_text: '', amount: 1 },
    { kind: 'item', display_text: '', result_text: '', amount: 1, item_name: '' },
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

export function itemsInStory(story: Story): string[] {
  return [...new Set(story.scenes.flatMap(s => s.choices.filter(c => c.kind === 'item' && c.item_name).map(c => c.item_name!)))]
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
  items?: { texts: Scene['item_texts']; outcome: 'victory' | 'defeat'; collected: boolean },
): string {
  return text.replace(/\{([\w\s:'-]+)\}/g, (_, key: string) => {
    if (key.startsWith('item_text:')) {
      const entry = items?.texts?.[key.slice('item_text:'.length)]
      return items?.collected && entry ? entry[items.outcome] ?? '' : ''
    }
    return samples[key]?.trim() || `[${key}]`
  })
}
