import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'jb_rpg_sound'
const FADE_MS = 1800

function fade(audio: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = audio.volume
  const start = performance.now()
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / ms)
    audio.volume = from + (to - from) * k
    if (k < 1) requestAnimationFrame(step)
    else done?.()
  }
  requestAnimationFrame(step)
}

/** Whether this device plays the story's sound. Off until the storyteller turns it on (browsers need a click). */
export function useSoundEnabled() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'on'
    } catch {
      return false
    }
  })
  const toggle = useCallback(() => {
    setEnabled(on => {
      try {
        localStorage.setItem(STORAGE_KEY, on ? 'off' : 'on')
      } catch {
        // per-device preference only
      }
      return !on
    })
  }, [])
  return { enabled, toggle }
}

/** Loops `src`, cross-fading whenever it changes; silent when disabled or null. */
export function useAmbience(src: string | null, enabled: boolean, volume = 0.55) {
  const current = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const playing = current.current
    const wanted = enabled ? src : null
    if (playing && playing.dataset.src === wanted) return

    if (playing) {
      fade(playing, 0, FADE_MS, () => {
        playing.pause()
        playing.removeAttribute('src')
      })
      current.current = null
    }
    if (!wanted) return

    const next = new Audio(wanted)
    next.loop = true
    next.volume = 0
    next.dataset.src = wanted
    next.play().then(() => fade(next, volume, FADE_MS)).catch(() => {})
    current.current = next
  }, [src, enabled, volume])

  useEffect(() => () => {
    current.current?.pause()
    current.current = null
  }, [])
}

/** Play a one-shot sound (a moment's sting). */
export function playSting(src: string, volume = 0.8) {
  const audio = new Audio(src)
  audio.volume = volume
  audio.play().catch(() => {})
}
