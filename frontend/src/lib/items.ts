import type { ThemeName } from '../types'

/**
 * Item icons. A story can give an item its icon (`Choice.item_icon`); otherwise it comes from
 * words in the item's name, and a name that matches nothing gets the theme's own.
 * Drawings are 24×24, stroked.
 */
export type ItemIconName =
  | 'key' | 'blade' | 'wand' | 'shield' | 'ring' | 'amulet' | 'jewel' | 'orb' | 'vial' | 'light'
  | 'writing' | 'instrument' | 'coin' | 'chip' | 'tool' | 'food' | 'feather' | 'bone'
  | 'pouch' | 'canister' | 'datapad' | 'jar' | 'idol' | 'parcel'

// In matching order: the first whose words appear in the name wins
export const ITEM_ICONS: Record<ItemIconName, { label: string; words?: RegExp; d: string }> = {
  chip: { label: 'Chip', words: /chip|keycard|data|drive|disk|implant|card/, d: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4' },
  ring: { label: 'Ring', words: /\bring\b/, d: 'M12 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM9.5 9.5L8 6l4-3 4 3-1.5 3.5' },
  amulet: { label: 'Amulet', words: /amulet|locket|pendant|necklace|charm|talisman/, d: 'M5 3c0 5 3 8 7 9 4-1 7-4 7-9M12 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  key: { label: 'Key', words: /key|lock|door|gate|vault/, d: 'M4 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0M12 12h9M18 12v3M21 12v2' },
  wand: { label: 'Wand', words: /wand|staff|rod|scepter|sceptre/, d: 'M4 20l10-10M17 3l1 2.5 2.5 1-2.5 1L17 10l-1-2.5-2.5-1 2.5-1z' },
  blade: { label: 'Blade', words: /sword|blade|knife|dagger|axe|cutter|spear|saber|sabre/, d: 'M12 2v14M10.5 4L12 2l1.5 2M8 16h8M12 16v5M10 21h4' },
  shield: { label: 'Shield', words: /shield|armou?r|helm|ward|cloak/, d: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z' },
  orb: { label: 'Orb', words: /orb|sphere|globe|ball/, d: 'M12 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM7 21h10M9 17l-1 4M15 17l1 4M9 9a3 3 0 0 1 3-3' },
  vial: { label: 'Potion', words: /potion|draught|vial|flask|elixir|tonic|stim|pill|medicine|painkiller|serum|syringe|bottle/, d: 'M10 3h4M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9' },
  light: { label: 'Light', words: /lantern|lamp|candle|torch|flashlight|light/, d: 'M9 3h6M10 3v2M14 3v2M7 5h10l-1 13H8zM6 18h12v3H6zM12 9c2 2 2 4 0 6-2-2-2-4 0-6z' },
  writing: { label: 'Writing', words: /book|scroll|letter|note|page|diary|journal|tome|map|chart|paper/, d: 'M6 4h12v16H6zM9 8h6M9 11h6M9 14h4M6 4c-1.5 0-2 1-2 2s.5 2 2 2M18 20c1.5 0 2-1 2-2s-.5-2-2-2' },
  instrument: { label: 'Instrument', words: /mandolin|lute|harp|flute|horn|drum|violin|fiddle|guitar|whistle|bell|music/, d: 'M13 11c-2-2-6-2-8 1s-1 7 2 8 6 0 8-2 1-5-2-7zM13 11l6-6M17.5 3.5l3 3M9 16h.01' },
  jewel: { label: 'Gem', words: /gem|jewel|crystal|diamond|ruby|emerald|sapphire|stone/, d: 'M7 4h10l4 5-9 12L3 9zM3 9h18M9 4l3 5 3-5M12 9v12' },
  coin: { label: 'Coin', words: /coin|gold|credit|cred|cash|money|dollar|purse/, d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z' },
  tool: { label: 'Tool', words: /wrench|hammer|rope|tool|compass|crowbar|pick/, d: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z' },
  food: { label: 'Food', words: /bread|apple|ration|food|meat|cheese|fruit|loaf|snack/, d: 'M4 11a4 4 0 0 1 3-6h10a4 4 0 0 1 3 6v8H4zM9 9l1 3M14 9l1 3' },
  feather: { label: 'Feather', words: /feather|quill|plume/, d: 'M20 4C12 4 6 10 6 18M6 18l-2 2M20 4c0 8-5 13-12 13M10 13h5M12 9h5' },
  bone: { label: 'Bone', words: /bone|skull|tooth|claw|fang/, d: 'M7 4a2 2 0 0 0-3 3 2 2 0 0 0 3 3l7 7a2 2 0 0 0 3 3 2 2 0 0 0 3-3 2 2 0 0 0-3-3l-7-7a2 2 0 0 0-3-3z' },
  // Each theme's own, for names that match nothing
  pouch: { label: 'Pouch', d: 'M9 5h6M10 3l2 2 2-2M9 6C5 9 4 13 5 16s4 5 7 5 6-2 7-5 0-7-4-10M9 12h6' },
  canister: { label: 'Canister', d: 'M8 3h8v3H8zM6 6h12v15H6zM6 10h12M6 17h12M10 13h4' },
  datapad: { label: 'Datapad', d: 'M6 3h9l3 3v15H6zM9 7h6M9 11h3M9 15h6M15 3v3h3' },
  jar: { label: 'Jar', d: 'M8 3h8v3H8zM7 6h10v13a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM10 12c1-1 3-1 4 0s1 3-1 3-2-1-1-2' },
  idol: { label: 'Idol', d: 'M12 2l5 6-2 13H9L7 8zM10 11a2 2 0 1 0 4 0 2 2 0 0 0-4 0M9 17h6' },
  parcel: { label: 'Parcel', d: 'M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0M9 12h6' },
}

export const THEME_ITEM_ICON: Record<ThemeName, ItemIconName> = {
  fantasy: 'pouch',
  deep_space: 'canister',
  cyberpunk: 'datapad',
  horror: 'jar',
  insanity: 'idol',
  modern: 'parcel',
}

export const ITEM_ICON_NAMES = Object.keys(ITEM_ICONS) as ItemIconName[]

/** The icon the story gave the item, else one its name calls for, else the theme's own */
export function itemIconFor(name: string, theme: ThemeName, icon?: string | null): ItemIconName {
  if (icon && icon in ITEM_ICONS) return icon as ItemIconName
  const text = name.toLowerCase()
  return ITEM_ICON_NAMES.find(n => ITEM_ICONS[n].words?.test(text)) ?? THEME_ITEM_ICON[theme]
}
