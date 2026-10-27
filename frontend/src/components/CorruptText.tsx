import { useEffect, useState } from 'react'
import { corruptWord, corruptionPace, type CorruptionKind } from '../lib/corruption'

interface CorruptTextProps {
  text: string
  /** 0 = sane, 1 = gone. Drives how often and how badly words flicker. */
  madness: number
  enabled: boolean
}

/**
 * Text that misbehaves: random words flicker into runes or Zalgo for a moment,
 * more often as madness rises. Screen readers always get the clean text.
 */
export function CorruptText({ text, madness, enabled }: CorruptTextProps) {
  const [hits, setHits] = useState<Record<number, string>>({})
  const tokens = text.split(/(\s+)/)

  useEffect(() => {
    if (!enabled) return
    const wordIndexes = text.split(/(\s+)/).flatMap((t, i) => (t.trim() ? [i] : []))
    if (wordIndexes.length === 0) return
    let burst = 0
    let heal = 0

    function tick() {
      const { delay, words } = corruptionPace(madness)
      const next: Record<number, string> = {}
      const all = text.split(/(\s+)/)
      for (let k = 0; k < words; k++) {
        const i = wordIndexes[Math.floor(Math.random() * wordIndexes.length)]
        const kind: CorruptionKind = Math.random() < 0.5 ? 'rune' : 'zalgo'
        next[i] = corruptWord(all[i], kind, madness)
      }
      setHits(next)
      heal = window.setTimeout(() => setHits({}), 160 + Math.random() * 260)
      burst = window.setTimeout(tick, delay * (0.7 + Math.random() * 0.6))
    }

    burst = window.setTimeout(tick, corruptionPace(madness).delay)
    return () => {
      clearTimeout(burst)
      clearTimeout(heal)
    }
  }, [text, madness, enabled])

  return (
    <>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {tokens.map((token, i) =>
          enabled && hits[i] ? <span key={i} className="corrupt">{hits[i]}</span> : token
        )}
      </span>
    </>
  )
}
