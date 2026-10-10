/**
 * Toggle one row in a selection. With `range` (shift-click) every row between the anchor and the
 * clicked one, in display order, takes the clicked row's new state - like a file manager.
 */
export function toggleSelection(order: string[], selected: string[], id: string, anchor: string | null, range: boolean): string[] {
  const on = !selected.includes(id)
  const a = anchor ? order.indexOf(anchor) : -1
  const b = order.indexOf(id)
  const ids = range && a !== -1 && b !== -1 ? order.slice(Math.min(a, b), Math.max(a, b) + 1) : [id]
  return on ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x))
}
