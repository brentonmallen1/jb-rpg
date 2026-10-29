import type { Character } from '../types'

/**
 * A hero's crest, generated from their answers: the same hero and variant always draw the same
 * crest, so the server only stores which variant the table chose. Emblems ("charges") come from
 * words in the answers when one matches (a lantern, the sea…), otherwise from the seed.
 */
export interface CrestSpec {
  charge: Charge
  division: number  // a pattern index, read by each theme's recipe
  palette: number   // a colour pairing index, read by each theme's recipe
  turn: number      // 0–1, a rotation or offset a recipe can use
  initials: string
  name: string
}

export type Charge =
  | 'lantern' | 'waves' | 'star' | 'moon' | 'sun' | 'key' | 'sword'
  | 'crown' | 'tree' | 'flame' | 'eye' | 'book' | 'bird'

/** Each charge, the words that call it up, and its drawing (24×24, stroked) */
export const CHARGES: Record<Charge, { words: RegExp; d: string }> = {
  lantern: { words: /lantern|lamp|light|candle|torch/, d: 'M9 3h6M10 3v2M14 3v2M7 5h10l-1 13H8zM6 18h12v3H6zM12 9c2 2 2 4 0 6-2-2-2-4 0-6z' },
  waves: { words: /sea|ocean|marsh|river|lake|water|tide|wave|salt|shore|rain/, d: 'M3 8q2.25-2.5 4.5 0t4.5 0 4.5 0 4.5 0M3 13q2.25-2.5 4.5 0t4.5 0 4.5 0 4.5 0M5 18q1.75-2 3.5 0t3.5 0 3.5 0 3.5 0' },
  star: { words: /star|sky|comet|wish|space/, d: 'M12 2l2.9 6.5 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.1l7.1-.6z' },
  moon: { words: /moon|night|silver|dream|tide/, d: 'M16 3a9 9 0 1 0 5 15A8 8 0 0 1 16 3z' },
  sun: { words: /sun|dawn|gold|day|summer|bright/, d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1' },
  key: { words: /key|lock|door|secret|gate|vault/, d: 'M4 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0M12 12h9M18 12v3M21 12v2' },
  sword: { words: /sword|blade|knife|dagger|war|fight|steel|axe/, d: 'M12 2v14M10.5 4L12 2l1.5 2M8 16h8M12 16v5M10 21h4' },
  crown: { words: /crown|king|queen|throne|royal|prince|lord|lady/, d: 'M3 18h18M4 18L3 7l5 4 4-7 4 7 5-4-1 11' },
  tree: { words: /tree|forest|wood|oak|leaf|grove|garden|root/, d: 'M12 22v-6M12 2l6 8h-3l4 6H5l4-6H6z' },
  flame: { words: /fire|flame|ember|burn|dragon|ash|smoke/, d: 'M12 2c4 5 6 8 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-8z' },
  eye: { words: /eye|see|watch|seer|vision|ghost|spirit/, d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
  book: { words: /book|scroll|tome|letter|map|story|word|song/, d: 'M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6v14' },
  bird: { words: /bird|raven|crow|owl|wing|feather|heron|hawk|eagle|fly/, d: 'M3 14c4 0 6-3 8-7 1 3 3 4 6 4l4-2-2 4c-2 4-6 6-11 6-2 0-4-1-5-3z' },
}

const ALL = Object.keys(CHARGES) as Charge[]

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A small seeded random number generator (mulberry32) */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w))
  return words.slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'
}

/** The charges this hero's answers call for first, then the rest in a seeded order */
function chargesFor(character: Character, seed: number): Charge[] {
  const text = [character.name, character.description, ...Object.values(character.fields ?? {})].join(' ').toLowerCase()
  const called = ALL.filter(c => CHARGES[c].words.test(text))
  const rand = random(seed)
  const rest = ALL.filter(c => !called.includes(c)).sort(() => rand() - 0.5)
  return [...called, ...rest]
}

export function crestFor(character: Character, variant: number): CrestSpec {
  const seed = hash([character.name, ...Object.values(character.fields ?? {})].join('|'))
  const charges = chargesFor(character, seed)
  const rand = random(seed + variant * 7919)
  return {
    charge: charges[variant % charges.length],
    division: Math.floor(rand() * 6),
    palette: Math.floor(rand() * 4),
    turn: rand(),
    initials: initialsOf(character.name),
    name: character.name,
  }
}

/** The three crests offered together: "Another three" moves to the next round */
export function crestRound(round: number): number[] {
  return [round * 3, round * 3 + 1, round * 3 + 2]
}
