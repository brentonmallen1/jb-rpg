import { useCallback, useState } from 'react'

/**
 * Runs async actions with a shared pending flag and error message, so a failed
 * action always shows up in the UI instead of becoming an unhandled rejection.
 */
export function useAsyncAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (action: () => Promise<unknown>, fallbackMessage = 'Something went wrong'): Promise<boolean> => {
    setPending(true)
    try {
      await action()
      setError(null)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage)
      return false
    } finally {
      setPending(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { run, pending, error, clearError }
}

export type RunAction = ReturnType<typeof useAsyncAction>['run']
