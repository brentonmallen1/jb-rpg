/**
 * Insert text at the cursor of a controlled <input>/<textarea>. Uses the native
 * value setter + an input event, so the field's own React onChange handles it.
 */
export function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(start + text.length, start + text.length)
  })
}
