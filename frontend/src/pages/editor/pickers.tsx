import type { Scene, Story } from '../../types'
import { END } from '../../types'
import { addItem, itemUses, newItemId, newScene, storyItems } from '../../lib/storyEdit'
import { ItemIcon } from '../../components/ItemIcon'
import { Combobox } from './Combobox'

type Update = (change: (story: Story) => Story) => void

interface TargetPickerProps {
  id?: string
  story: Story
  /** The scene the link starts from (it can't lead to itself) */
  scene: Scene
  value: string | null | undefined
  /** What "no link" means here, e.g. "After this scene (Next: The Bridge)" */
  defaultLabel: string
  defaultHint?: string
  onChange: (target: string | null) => void
  update: Update
  'aria-label'?: string
  invalid?: boolean
}

/** Where a link leads: a scene (searched by title), The end, or a new scene made on the spot. */
export function TargetPicker({ id, story, scene, value, defaultLabel, defaultHint, onChange, update, invalid, ...rest }: TargetPickerProps) {
  const options = [
    { value: '', label: defaultLabel, hint: defaultHint },
    ...story.scenes.filter(s => s.id !== scene.id).map(s => ({
      value: s.id,
      label: s.title || 'Untitled scene',
      hint: s.is_finale ? 'Finale' : s.display_name || undefined,
      group: 'Scenes',
    })),
    { value: END, label: 'The end', hint: 'On to the d20 finale roll', group: 'Or' },
  ]
  return (
    <Combobox
      id={id}
      aria-label={rest['aria-label']}
      invalid={invalid}
      value={value ?? ''}
      options={value && value !== END && !story.scenes.some(s => s.id === value)
        ? [...options, { value, label: 'A scene that no longer exists' }]
        : options}
      onChange={v => onChange(v || null)}
      onCreate={title => {
        const created = { ...newScene(story.scenes.length + 1), title }
        update(s => ({ ...s, scenes: [...s.scenes, created] }))
        onChange(created.id)
      }}
      createLabel={title => `New scene “${title}”`}
      placeholder="Search scenes"
    />
  )
}

interface ItemPickerProps {
  id?: string
  story: Story
  value: string | null | undefined
  onChange: (itemId: string) => void
  update: Update
  invalid?: boolean
  'aria-label'?: string
}

/** An item from the story's catalogue, or a new one added to it on the spot. */
export function ItemPicker({ id, story, value, onChange, update, invalid, ...rest }: ItemPickerProps) {
  const options = storyItems(story).map(item => {
    const given = itemUses(story, item.id).given
    return {
      value: item.id,
      label: item.name || 'Unnamed item',
      lead: <ItemIcon name={item.name} icon={item.icon} theme={story.theme} size={18} className="outcome--item" />,
      hint: given.length
        ? `Given in ${[...new Set(given.map(u => u.scene?.title || 'Untitled scene'))].join(', ')}`
        : 'Nothing gives it yet',
    }
  })
  return (
    <Combobox
      id={id}
      aria-label={rest['aria-label']}
      invalid={invalid}
      value={value}
      options={options}
      onChange={onChange}
      onCreate={name => {
        const item = { id: newItemId(story, name), name }
        update(s => addItem(s, item))
        onChange(item.id)
      }}
      createLabel={name => `New item “${name}”`}
      placeholder="Search items, or name a new one"
    />
  )
}
