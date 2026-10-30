import { useContext, type ReactNode } from 'react'
import type { Story } from '../../types'
import { storyItems } from '../../lib/storyEdit'
import { SuggestionsContext } from './suggest'

/** In finale texts, "{" also offers each item's text: it appears only if the party found the item. */
export function FinaleSuggestions({ story, on, children }: { story: Story; on: boolean; children: ReactNode }) {
  const outer = useContext(SuggestionsContext)
  if (!on) return <>{children}</>
  const items = storyItems(story)
    .filter(item => item.name.trim())
    .map(item => ({ token: `{item_text:${item.name}}`, hint: `only if they found ${item.name}` }))
  return <SuggestionsContext.Provider value={[...outer, ...items]}>{children}</SuggestionsContext.Provider>
}
