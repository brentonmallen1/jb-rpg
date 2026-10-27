import { useState, useEffect, useRef, useCallback } from 'react'

export type SaveStatus = 'saved' | 'saving' | 'unsaved'

interface UseAutoSaveOptions<T> {
  /** Data to track for changes */
  data: T | null
  /** Function to call when saving */
  onSave: () => Promise<void>
  /** Debounce delay in ms (default: 2000) */
  debounceMs?: number
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean
}

interface UseAutoSaveReturn {
  /** Current save status */
  status: SaveStatus
  /** Trigger an immediate save */
  saveNow: () => Promise<void>
  /** Ref to current status (for use in cleanup functions) */
  statusRef: React.MutableRefObject<SaveStatus>
  /** Ref to saveNow (for use in cleanup functions) */
  saveNowRef: React.MutableRefObject<() => Promise<void>>
}

/**
 * Auto-save hook with debouncing.
 * Tracks changes to data and saves after a delay.
 * Does not interrupt typing — waits for pause before saving.
 */
export function useAutoSave<T>({
  data,
  onSave,
  debounceMs = 2000,
  enabled = true
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [status, setStatus] = useState<SaveStatus>('saved')

  // Track the last saved version to detect changes
  const lastSavedDataRef = useRef<string | null>(null)
  const debounceTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  // Refs for cleanup functions (avoid stale closures)
  const statusRef = useRef<SaveStatus>(status)
  const onSaveRef = useRef(onSave)

  // Keep refs in sync
  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  // Perform the actual save
  const performSave = useCallback(async () => {
    if (!isMountedRef.current) return

    setStatus('saving')
    statusRef.current = 'saving'

    try {
      await onSaveRef.current()
      if (isMountedRef.current) {
        // Update last saved data to current
        lastSavedDataRef.current = JSON.stringify(data)
        setStatus('saved')
        statusRef.current = 'saved'
      }
    } catch (err) {
      console.error('Auto-save failed:', err)
      if (isMountedRef.current) {
        // Revert to unsaved on error
        setStatus('unsaved')
        statusRef.current = 'unsaved'
      }
    }
  }, [data])

  // Save immediately (for navigation away)
  const saveNow = useCallback(async () => {
    // Clear any pending debounced save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    // Only save if there are unsaved changes
    if (statusRef.current === 'unsaved') {
      await performSave()
    }
  }, [performSave])

  // Ref for saveNow (for cleanup)
  const saveNowRef = useRef(saveNow)
  useEffect(() => {
    saveNowRef.current = saveNow
  }, [saveNow])

  // Initialize lastSavedData on first load
  useEffect(() => {
    if (data !== null && lastSavedDataRef.current === null) {
      lastSavedDataRef.current = JSON.stringify(data)
    }
  }, [data])

  // Detect changes and schedule auto-save
  useEffect(() => {
    if (!enabled || data === null) return

    const currentData = JSON.stringify(data)
    const hasChanges = currentData !== lastSavedDataRef.current

    if (hasChanges) {
      // Mark as unsaved. Syncing with the debounce timer below is this effect's job.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('unsaved')
      statusRef.current = 'unsaved'

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      // Schedule save after debounce delay
      debounceTimerRef.current = window.setTimeout(() => {
        performSave()
      }, debounceMs)
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [data, enabled, debounceMs, performSave])

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return {
    status,
    saveNow,
    statusRef,
    saveNowRef
  }
}
