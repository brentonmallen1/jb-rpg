import type { ThemeName } from '../types'

/** What each theme calls the party's health. */
export const HEALTH_LABEL: Record<ThemeName, string> = {
  fantasy: 'Lanterns',
  horror: 'Sight',
  cyberpunk: 'Integrity',
  deep_space: 'Hull',
  insanity: 'Sanity',
  modern: 'Health',
}

/** Backdrop moods each theme can set per scene. The first is the theme's default feel. */
export const MOODS: Record<ThemeName, { id: string; label: string }[]> = {
  fantasy: [
    { id: 'candlelit', label: 'Candlelit hall' },
    { id: 'forest', label: 'Forest canopy' },
    { id: 'crypt', label: 'Cold crypt' },
    { id: 'storm', label: 'Storm' },
  ],
  cyberpunk: [
    { id: 'neon', label: 'Neon street' },
    { id: 'rain', label: 'Acid rain' },
    { id: 'static', label: 'Dead signal' },
  ],
  deep_space: [
    { id: 'nebula', label: 'Nebula' },
    { id: 'sun', label: 'Distant sun' },
    { id: 'void', label: 'The void' },
  ],
  horror: [
    { id: 'fog', label: 'Fog' },
    { id: 'cellar', label: 'Cellar' },
    { id: 'mirror', label: 'Cold glass' },
  ],
  insanity: [
    { id: 'swirl', label: 'Swirl' },
    { id: 'abyss', label: 'Abyss' },
    { id: 'bloom', label: 'Bloom' },
  ],
  modern: [
    { id: 'dusk', label: 'Dusk' },
    { id: 'night', label: 'Night' },
    { id: 'noir', label: 'Noir' },
  ],
}

/** The scene's chosen mood if this theme has it, otherwise a stable pick from its seed. */
export function moodFor(theme: ThemeName, mood?: string | null, seed?: number): string {
  const moods = MOODS[theme]
  if (mood && moods.some(m => m.id === mood)) return mood
  return moods[(seed ?? 0) % moods.length].id
}

/** The server's mood seed for a scene (zlib CRC-32 of its id), so previews pick the same mood. */
export function moodSeed(sceneId: string): number {
  let crc = 0xffffffff
  for (const byte of new TextEncoder().encode(sceneId)) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}
