import { useState } from 'react'
import type { Story, StoryProblem } from '../../types'
import { ITEM_DRAG } from '../../lib/storyGraph'
import { addItem, deleteItem, findItem, itemUses, newItemId, patchItem, renameItem, storyItems, type ItemUse } from '../../lib/storyEdit'
import { ConfirmDialog } from '../../components'
import { ItemIcon } from '../../components/ItemIcon'
import { CloseIcon } from '../../components/Icons'
import { Field, Section, TextArea, TextInput } from './fields'
import { ItemIconPicker } from './ItemIconPicker'
import { WritingDialog, type WritingEntry } from './WritingDialog'
import type { EditorSelection } from './EditorNav'

interface ItemsPanelProps {
  story: Story
  /** The item open on the right; the first one when unset */
  itemId?: string
  problems: StoryProblem[]
  update: (change: (story: Story) => Story) => void
  onSelect: (selection: EditorSelection) => void
  /** In the Flow view, items can be dragged onto a choice (to give it) or a route (to check for it) */
  dragToCanvas?: boolean
}

const USE_LABEL: Record<ItemUse['what'], string> = { choice: 'Choice', line: 'Text', route: 'Route', lock: 'Lock', finale: 'Finale text' }

/** Every item the story can give, in one place: choices give them; lines, routes, locks and finale texts check for them. */
export function ItemsPanel({ story, itemId, problems, update, onSelect, dragToCanvas }: ItemsPanelProps) {
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [writing, setWriting] = useState<string | null>(null)
  const items = storyItems(story)
  const item = findItem(story, itemId) ?? items[0]
  const q = query.trim().toLowerCase()
  const shown = q ? items.filter(i => i.name.toLowerCase().includes(q)) : items
  const problemsFor = (id: string) => problems.filter(p => p.area === 'items' && p.index !== null && items[p.index]?.id === id)

  function create() {
    const name = query.trim() || 'New item'
    const created = { id: newItemId(story, name), name }
    update(s => addItem(s, created))
    setQuery('')
    onSelect({ kind: 'items', id: created.id })
  }

  const uses = item ? itemUses(story, item.id) : null
  const jump = (use: ItemUse) => onSelect(use.scene ? { kind: 'scene', id: use.scene.id, focus: use.focus } : { kind: 'opening', focus: use.focus })
  // The writing window holds every item's description, so they can be written side by side
  const descriptions: WritingEntry[] = items.map(i => ({
    id: i.id,
    group: 'About the items',
    label: i.name || 'Unnamed item',
    sub: 'players read it in the backpack',
    value: i.description ?? '',
    maxLength: 600,
    onChange: text => update(s => patchItem(s, i.id, { description: text || null })),
  }))

  return (
    <div className="ed-panel ed-items">
      <div className="ed-panel__head">
        <span className="stage-label">Items</span>
        <button type="button" className="s-btn s-btn--ghost" onClick={create}>+ New item</button>
      </div>
      <p className="ed-muted">
        Every item this story can give. Choices give them; routes, locked doors, finale texts and lines that change check for them.
        Renaming one renames it everywhere.
        {dragToCanvas && ' Drag one onto a choice to give it, or onto a route to check for it.'}
      </p>

      {items.length === 0 ? (
        <div className="ed-empty">
          <p>No items yet. Add one here, or from a choice that finds an item.</p>
          <button type="button" className="s-btn" onClick={create}>Add an item</button>
        </div>
      ) : (
        <div className="ed-items__layout">
          <div className="ed-items__list">
            <input
              type="search"
              className="ed-input"
              aria-label="Search items"
              placeholder="Search items"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !shown.length && create()}
            />
            <ul>
              {shown.map(i => {
                const { given, checked } = itemUses(story, i.id)
                const problem = problemsFor(i.id)[0]
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      className={`ed-items__row ${i.id === item?.id ? 'is-active' : ''}`}
                      aria-current={i.id === item?.id || undefined}
                      onClick={() => onSelect({ kind: 'items', id: i.id })}
                      draggable={dragToCanvas}
                      onDragStart={e => {
                        e.dataTransfer.setData(ITEM_DRAG, i.id)
                        e.dataTransfer.setData('text/plain', i.name)
                        e.dataTransfer.effectAllowed = 'copy'
                        document.body.classList.add('is-dragging-item')
                      }}
                      onDragEnd={() => document.body.classList.remove('is-dragging-item')}
                    >
                      <ItemIcon name={i.name} icon={i.icon} theme={story.theme} size={20} className="outcome--item" />
                      <span className="ed-items__row-text">
                        <span className="ed-items__row-name">{i.name || 'Unnamed item'}</span>
                        <span className={`ed-items__row-meta ${problem ? 'is-problem' : ''}`}>
                          {problem ? problem.message : `${given.length ? `Given ${given.length}×` : 'Not given yet'} · ${checked.length ? `checked ${checked.length}×` : 'never checked'}`}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
              {shown.length === 0 && (
                <li><button type="button" className="ed-items__row" onClick={create}>+ New item “{query.trim()}”</button></li>
              )}
            </ul>
          </div>

          {item && uses && (
            <section className="ed-items__detail" aria-label={item.name || 'Unnamed item'}>
              <div className="ed-items__detail-head">
                <Field label="Name" htmlFor="item-name" error={problemsFor(item.id).find(p => p.field === 'name')?.message ?? null}>
                  <TextInput
                    id="item-name"
                    value={item.name}
                    onChange={e => update(s => renameItem(s, item.id, e.target.value))}
                    placeholder="Climbing Rope"
                  />
                </Field>
                <button type="button" className="icon-btn" aria-label={`Delete ${item.name || 'this item'}`} title="Delete this item" onClick={() => setConfirmDelete(true)}>
                  <CloseIcon />
                </button>
              </div>

              <ItemIconPicker
                id="item-icon"
                itemName={item.name}
                icon={item.icon}
                theme={story.theme}
                onChange={icon => update(s => patchItem(s, item.id, { icon }))}
              />

              <Field label="About the item" hint="optional; players read it in the backpack" htmlFor="item-description">
                <TextArea
                  id="item-description"
                  className="ed-textarea--reading"
                  value={item.description ?? ''}
                  onChange={e => update(s => patchItem(s, item.id, { description: e.target.value || null }))}
                  placeholder="Older than the cave itself, and still warm to the touch."
                  maxLength={600}
                  onExpand={() => setWriting(item.id)}
                />
              </Field>

              <Section title="Given by">
                {uses.given.length ? <UseList uses={uses.given} onJump={jump} /> : (
                  <p className="ed-muted">No choice gives it yet. Pick it on a choice that finds an item.</p>
                )}
              </Section>
              <Section title="Checked by">
                {uses.checked.length ? <UseList uses={uses.checked} onJump={jump} /> : (
                  <p className="ed-muted">Nothing checks for it. Routes, locked doors, finale texts and lines that change can.</p>
                )}
              </Section>
            </section>
          )}
        </div>
      )}

      <WritingDialog title="Items" entries={descriptions} openId={writing} onClose={() => setWriting(null)} />

      <ConfirmDialog
        isOpen={confirmDelete && !!item}
        onConfirm={() => {
          setConfirmDelete(false)
          if (!item) return
          update(s => deleteItem(s, item.id))
          const rest = items.filter(i => i.id !== item.id)
          onSelect({ kind: 'items', id: rest[0]?.id })
        }}
        onCancel={() => setConfirmDelete(false)}
        title={`Delete ${item?.name || 'this item'}?`}
        message={uses && uses.given.length + uses.checked.length > 0
          ? `It's given by ${uses.given.length} ${uses.given.length === 1 ? 'choice' : 'choices'} and checked in ${uses.checked.length} ${uses.checked.length === 1 ? 'place' : 'places'}. Those choices will need another item, and the checks are removed. You can undo this.`
          : 'Nothing uses it yet. You can undo this.'}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  )
}

function UseList({ uses, onJump }: { uses: ItemUse[]; onJump: (use: ItemUse) => void }) {
  return (
    <ul className="ed-uses">
      {uses.map((use, i) => (
        <li key={i}>
          <button type="button" className="ed-uses__row" onClick={() => onJump(use)}>
            <span className={`ed-uses__kind ed-uses__kind--${use.what}`}>{USE_LABEL[use.what]}</span>
            <span className="ed-uses__text">
              <span className="ed-uses__where">{use.scene ? use.scene.title || 'Untitled scene' : 'Prologue'}</span>
              {use.detail && <span className="ed-uses__detail">{use.detail}</span>}
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
