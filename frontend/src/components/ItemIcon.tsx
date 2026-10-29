import { ITEM_ICONS, itemIconFor } from '../lib/items'
import { OUTCOME_ICON } from '../lib/outcomes'
import type { Choice, ThemeName } from '../types'

interface ItemIconProps {
  name: string
  theme: ThemeName
  /** The icon the story chose; unset picks one from the name */
  icon?: string | null
  size?: number
  /** Framed in the theme's form (like its crest), for cards and the backpack; bare for lists */
  framed?: boolean
  className?: string
}

/** Draws a 24-unit glyph centred on (cx, cy) */
function Glyph({ d, cx, cy, size, color, width }: { d: string; cx: number; cy: number; size: number; color: string; width: number }) {
  const s = size / 24
  return (
    <g transform={`translate(${cx - size / 2} ${cy - size / 2}) scale(${s})`} fill="none" stroke={color} strokeWidth={width / s} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </g>
  )
}

// Each theme frames its items its own way: a wax seal, an inventory slot, a tag, a luggage tag, a shaking ring, a tile
const FRAMES: Record<ThemeName, (d: string) => React.ReactNode> = {
  fantasy: d => (
    <>
      <path d="M32 4l5 3 6-1 3 5 6 2 0 6 4 5-3 5 2 6-5 4-1 6-6 1-3 5-6-1-5 3-5-3-6 1-3-5-6-1-1-6-5-4 2-6-3-5 4-5 0-6 6-2 3-5 6 1z" fill="#7e2a1d" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#d9a557" strokeWidth="1.2" opacity=".7" />
      <Glyph d={d} cx={32} cy={32} size={28} color="#f2e6cf" width={1.9} />
    </>
  ),
  deep_space: d => (
    <>
      <path d="M32 4l24 14v28L32 60 8 46V18z" fill="var(--bg-secondary)" stroke="var(--accent)" strokeWidth="1.6" />
      <Glyph d={d} cx={32} cy={32} size={28} color="var(--accent)" width={1.8} />
    </>
  ),
  cyberpunk: d => (
    <>
      <path d="M12 6h40l8 8v32l-8 12H4V14z" fill="var(--accent)" />
      <rect x="48" y="50" width="6" height="4" fill="var(--danger)" />
      <Glyph d={d} cx={32} cy={32} size={30} color="var(--bg-primary)" width={2.2} />
    </>
  ),
  horror: d => (
    <>
      <path d="M48 2c-6 4-10 6-14 6" stroke="var(--text-secondary)" strokeWidth="1" fill="none" />
      <path d="M18 8h22l12 10v38l-3 2-3-2-3 2-3-2-3 2-3-2-3 2-3-2-3 2-3-2-3 2-3-2V18z" fill="#e8e2d6" />
      <circle cx="30" cy="16" r="2.5" fill="#0b0c0b" />
      <Glyph d={d} cx={32} cy={36} size={26} color="#5a1712" width={2} />
    </>
  ),
  insanity: d => (
    <>
      <g fill="none" stroke="var(--accent)" strokeLinecap="round" strokeWidth="1.6">
        <path d="M9 36a23 23 0 0 1 40-20" strokeDasharray="26 5 3 5" />
        <path d="M56 30a24 22 0 0 1-38 24" />
        <path d="M52 12l4-3M10 50l-4 3" />
      </g>
      <circle cx="47" cy="47" r="2" fill="var(--danger)" />
      <Glyph d={d} cx={32} cy={32} size={28} color="var(--text-primary)" width={1.8} />
    </>
  ),
  modern: d => (
    <>
      <rect x="6" y="6" width="52" height="52" rx="16" fill="var(--accent)" />
      <Glyph d={d} cx={32} cy={32} size={28} color="var(--bg-primary)" width={2} />
    </>
  ),
}

/** An item's icon: chosen by the story, or from its name, or the theme's own. */
export function ItemIcon({ name, theme, icon, size = 24, framed = false, className }: ItemIconProps) {
  const { d } = ITEM_ICONS[itemIconFor(name, theme, icon)]
  if (!framed) {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    )
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {FRAMES[theme](d)}
    </svg>
  )
}

/** A choice's outcome as a small icon: the item's own for a found item, otherwise the outcome's */
export function ChoiceOutcomeIcon({ choice, theme, size = 16, className }: { choice: Pick<Choice, 'kind' | 'item_name' | 'item_icon'>; theme: ThemeName; size?: number; className?: string }) {
  if (choice.kind === 'item' && choice.item_name) {
    return <ItemIcon name={choice.item_name} icon={choice.item_icon} theme={theme} size={size} className={className} />
  }
  const Icon = OUTCOME_ICON[choice.kind]
  return <Icon size={size} className={className} />
}
