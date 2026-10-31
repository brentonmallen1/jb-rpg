import { createContext } from 'react'

/** Sections fold away where room is short (the Flow view's drawer) */
export const FoldingSections = createContext(false)

/** Sent (bubbling) from a field a link points at, so a folded section around it opens first */
export const REVEAL_EVENT = 'ed-reveal'
