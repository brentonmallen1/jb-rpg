import { useEffect, useRef, useState } from 'react'
import * as api from '../../hooks/api'
import type { AudioFile, Story } from '../../types'
import { CloseIcon } from '../../components/Icons'
import { Field, Section } from './fields'

interface SoundSectionProps {
  story: Story
  audio: AudioFile[]
  onAudioChange: () => void
  update: (change: (story: Story) => Story) => void
}

const STINGS: { moment: string; label: string }[] = [
  { moment: 'scene_changed', label: 'A new scene begins' },
  { moment: 'hp_lost', label: 'A life is lost' },
  { moment: 'item_gained', label: 'An item is found' },
  { moment: 'level_up', label: 'Level up' },
  { moment: 'finale', label: 'The finale arrives' },
  { moment: 'victory', label: 'Victory' },
  { moment: 'defeat', label: 'Defeat' },
]

/** Remove every reference to an audio file (story default, stings, scene overrides). */
function forgetAudio(story: Story, name: string): Story {
  const sound = story.sound ?? { stings: {} }
  return {
    ...story,
    sound: {
      ambience: sound.ambience === name ? null : sound.ambience,
      stings: Object.fromEntries(Object.entries(sound.stings).filter(([, file]) => file !== name)),
    },
    scenes: story.scenes.map(s => (s.ambience === name ? { ...s, ambience: null } : s)),
  }
}

export function SoundSection({ story, audio, onAudioChange, update }: SoundSectionProps) {
  const sound = story.sound ?? { ambience: null, stings: {} }
  const input = useRef<HTMLInputElement>(null)
  const preview = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => preview.current?.pause(), [])

  function togglePreview(name: string) {
    preview.current?.pause()
    if (playing === name) {
      setPlaying(null)
      return
    }
    const audioEl = new Audio(api.audioUrl(story.id, name))
    audioEl.onended = () => setPlaying(null)
    audioEl.play().catch(() => setPlaying(null))
    preview.current = audioEl
    setPlaying(name)
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) await api.uploadAudio(story.id, file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      onAudioChange()
    }
  }

  async function remove(name: string) {
    if (playing === name) togglePreview(name)
    try {
      await api.deleteAudio(story.id, name)
      update(s => forgetAudio(s, name))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the file')
    } finally {
      onAudioChange()
    }
  }

  const setSound = (patch: Partial<typeof sound>) => update(s => ({ ...s, sound: { ...(s.sound ?? { stings: {} }), ...patch } }))

  return (
    <Section
      title="Sound"
      aside={
        <button type="button" className="s-btn s-btn--ghost" onClick={() => input.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : '+ Upload audio'}
        </button>
      }
    >
      <input ref={input} type="file" accept="audio/*" multiple hidden onChange={e => { upload(e.target.files); e.target.value = '' }} aria-label="Upload audio files" />
      <p className="ed-muted">
        Ambient loops and short stings play from the storyteller's screen (best on the TV) once sound is switched on there.
        Players' phones stay quiet. Up to 30 MB per file.
      </p>
      {error && <p className="ed-error" role="alert">{error}</p>}

      {audio.length > 0 && (
        <ul className="ed-audio">
          {audio.map(file => (
            <li key={file.name}>
              <button type="button" className="icon-btn" onClick={() => togglePreview(file.name)} aria-label={playing === file.name ? `Stop ${file.name}` : `Play ${file.name}`}>
                {playing === file.name ? '■' : '▶'}
              </button>
              <span className="ed-audio__name">{file.name}</span>
              <span className="ed-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" className="icon-btn" onClick={() => remove(file.name)} aria-label={`Delete ${file.name}`}>
                <CloseIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {audio.length > 0 && (
        <>
          <Field label="Ambience" hint="loops in the background; scenes can choose their own" htmlFor="story-ambience">
            <select id="story-ambience" className="ed-input" value={sound.ambience ?? ''} onChange={e => setSound({ ambience: e.target.value || null })}>
              <option value="">Silence</option>
              {audio.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
          </Field>

          <div className="ed-field">
            <span className="ed-label">Stings <span className="ed-hint">a short sound for each dramatic moment</span></span>
            <div className="ed-stings">
              {STINGS.map(({ moment, label }) => (
                <label key={moment} className="ed-sting">
                  <span>{label}</span>
                  <select
                    className="ed-inline-select"
                    value={sound.stings[moment] ?? ''}
                    onChange={e => {
                      const stings = { ...sound.stings }
                      if (e.target.value) stings[moment] = e.target.value
                      else delete stings[moment]
                      setSound({ stings })
                    }}
                  >
                    <option value="">None</option>
                    {audio.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </Section>
  )
}
