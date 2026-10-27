/** Sanity corruption: words briefly flicker into runes or Zalgo text. */

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'

export type CorruptionKind = 'rune' | 'zalgo'

export function corruptWord(word: string, kind: CorruptionKind, madness: number, random: () => number = Math.random): string {
  if (kind === 'rune') {
    return word.replace(/[A-Za-z]/g, () => RUNES[Math.floor(random() * RUNES.length)])
  }
  // Zalgo: stack combining marks (U+0300–U+036F) on every letter; more as madness grows
  const marks = 1 + Math.round(madness * 3)
  let out = ''
  for (const ch of word) {
    out += ch
    if (!/\s/.test(ch)) {
      for (let k = 0; k < marks; k++) out += String.fromCharCode(0x0300 + Math.floor(random() * 0x70))
    }
  }
  return out
}

/** How often a burst happens (ms) and how many words it touches, from sanity lost (0–1). */
export function corruptionPace(madness: number): { delay: number; words: number } {
  const m = Math.min(Math.max(madness, 0), 1)
  return { delay: 250 + 2800 * (1 - m) ** 2, words: 1 + Math.round(m * 8) }
}
