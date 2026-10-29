import { useState } from 'react'
import { ItemIcon } from '../../components/ItemIcon'
import { ITEM_ICONS, ITEM_ICON_NAMES, itemIconFor } from '../../lib/items'
import type { ThemeName } from '../../types'

interface ItemIconPickerProps {
  id: string
  itemName: string
  icon?: string | null
  theme: ThemeName
  onChange: (icon: string | null) => void
}

/** The item's icon, as the story's theme draws it. Automatic picks one from the name. */
export function ItemIconPicker({ id, itemName, icon, theme, onChange }: ItemIconPickerProps) {
  const [open, setOpen] = useState(false)
  const chosen = icon && icon in ITEM_ICONS ? icon : null
  const shown = itemIconFor(itemName, theme, chosen)

  return (
    <div className="ed-icon">
      <div className="ed-icon__current">
        <span className={`ed-icon__preview ${theme}`}>
          <ItemIcon name={itemName} icon={chosen} theme={theme} size={44} framed />
        </span>
        <span>
          <span className="ed-icon__label">{ITEM_ICONS[shown].label}</span>
          <span className="ed-muted"> · {chosen ? 'chosen' : 'automatic, from the name'}</span>
        </span>
        <button
          type="button"
          className="s-btn s-btn--ghost ed-icon__toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Done' : 'Change icon'}
        </button>
      </div>

      {open && (
        <div id={id} className="ed-icon__grid" role="radiogroup" aria-label="Item icon">
          <button
            type="button"
            role="radio"
            aria-checked={!chosen}
            className={`ed-icon__option ed-icon__option--auto ${!chosen ? 'is-chosen' : ''}`}
            onClick={() => onChange(null)}
          >
            Automatic
          </button>
          {ITEM_ICON_NAMES.map(name => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={chosen === name}
              aria-label={ITEM_ICONS[name].label}
              title={ITEM_ICONS[name].label}
              className={`ed-icon__option ${chosen === name ? 'is-chosen' : ''}`}
              onClick={() => onChange(name)}
            >
              <ItemIcon name="" icon={name} theme={theme} size={24} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
