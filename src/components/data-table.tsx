'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronDown, ChevronUp, Columns3 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toggleSelection } from '@/lib/selection'
import { compareSortValues } from '@/lib/table-sort'
import { cn } from '@/lib/utils'

export type DataTableColumn = {
  key: string
  label: string
  sortable?: boolean
  /** Direction of the first click (default asc) - e.g. desc for dates and counts. */
  firstDir?: 'asc' | 'desc'
  className?: string
  /** false = always shown, not in the "Columns" menu. */
  hideable?: boolean
  defaultHidden?: boolean
}

export type DataTableRow = {
  id: string
  cells: Record<string, React.ReactNode>
  /** Sort values per column; falls back to the cell when it's a string or number. */
  sort?: Record<string, string | number | null | undefined>
  className?: string
}

type Dir = 'asc' | 'desc'
type Layout = { widths?: Record<string, number>; visible?: Record<string, boolean> }

// Per-viewer layout (column widths + shown/hidden overrides) in localStorage, keyed by the table's `id`.
const MIN_WIDTH = 56
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }
const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
function write(key: string, layout: Layout) {
  try {
    if (!layout.widths && !layout.visible) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(layout))
  } catch { /* storage blocked - layout just won't persist */ }
  listeners.forEach((cb) => cb())
}
const parse = (raw: string | null): Layout => { try { return raw ? JSON.parse(raw) : {} } catch { return {} } }

/**
 * The house table: sortable headers, resizable and hideable columns (remembered per viewer).
 * Rows come pre-rendered from the server. Sorting is client-side, or - pass `sort` - server-side
 * via `?sort=&dir=` for paginated tables (the page maps the key to an orderBy).
 * Pass `selection` to get row checkboxes (select all / clear, shift-click for a range) and an
 * action bar that renders `selection.actions(ids, clear)` while rows are selected.
 */
export function DataTable({ id, columns, rows, empty = 'Nothing here yet.', sort: serverSort, selection }: {
  id: string
  columns: DataTableColumn[]
  rows: DataTableRow[]
  empty?: React.ReactNode
  sort?: { key: string | null; dir: Dir }
  selection?: { actions: (ids: string[], clear: () => void) => React.ReactNode }
}) {
  const storageKey = `table:${id}`
  const layout = parse(useSyncExternalStore(subscribe, () => read(storageKey), () => null))
  const [drag, setDrag] = useState<Record<string, number> | null>(null)
  const widths = drag ?? layout.widths
  const ths = useRef(new Map<string, HTMLTableCellElement>())
  const [local, setLocal] = useState<{ key: string | null; dir: Dir }>({ key: null, dir: 'asc' })
  const sort = serverSort ?? local
  const pathname = usePathname()
  const params = useSearchParams()
  const [picked, setPicked] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)

  const hideable = columns.filter((c) => c.hideable !== false)
  const isShown = (c: DataTableColumn) => c.hideable === false || (layout.visible?.[c.key] ?? !c.defaultHidden)
  const visible = columns.filter(isShown)
  const nextDir = (c: DataTableColumn): Dir => (sort.key === c.key ? (sort.dir === 'asc' ? 'desc' : 'asc') : (c.firstDir ?? 'asc'))

  const value = (r: DataTableRow, key: string) => {
    if (r.sort && key in r.sort) return r.sort[key]
    const cell = r.cells[key]
    return typeof cell === 'string' || typeof cell === 'number' ? cell : null
  }
  const shownRows = !serverSort && sort.key
    ? [...rows].sort((a, b) => compareSortValues(value(a, sort.key!), value(b, sort.key!), sort.dir))
    : rows
  // Rows that disappeared after a refresh drop out of the selection.
  const selected = picked.filter((x) => rows.some((r) => r.id === x))
  const allSelected = rows.length > 0 && selected.length === rows.length
  const clear = () => { setPicked([]); setAnchor(null) }
  function pick(e: React.MouseEvent, rowId: string) {
    setPicked(toggleSelection(shownRows.map((r) => r.id), selected, rowId, anchor, e.shiftKey))
    setAnchor(rowId)
  }

  function sortHref(c: DataTableColumn) {
    const p = new URLSearchParams(params)
    p.set('sort', c.key)
    p.set('dir', nextDir(c))
    p.delete('page')
    return `${pathname}?${p}`
  }

  function startResize(e: React.PointerEvent<HTMLSpanElement>, key: string) {
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    // The first resize freezes every visible column at its rendered width (table switches to fixed layout).
    const base: Record<string, number> = {}
    for (const c of visible) base[c.key] = widths?.[c.key] ?? ths.current.get(c.key)?.offsetWidth ?? MIN_WIDTH * 2
    const startX = e.clientX
    let latest = base
    const onMove = (ev: PointerEvent) => {
      latest = { ...base, [key]: Math.max(MIN_WIDTH, Math.round(base[key] + ev.clientX - startX)) }
      setDrag(latest)
    }
    // lostpointercapture fires after pointerup and pointercancel.
    const onEnd = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('lostpointercapture', onEnd)
      write(storageKey, { ...layout, widths: latest })
      setDrag(null)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('lostpointercapture', onEnd)
  }

  function toggle(c: DataTableColumn) {
    // Store only deviations from the default, so a later default change still applies.
    const { [c.key]: _, ...rest } = layout.visible ?? {}
    const visibleMap = isShown(c) === !c.defaultHidden ? { ...rest, [c.key]: !isShown(c) } : rest
    write(storageKey, { ...layout, visible: Object.keys(visibleMap).length ? visibleMap : undefined })
  }

  const tableWidth = widths ? visible.reduce((sum, c) => sum + (widths[c.key] ?? MIN_WIDTH * 2), 0) + 44 + (selection ? 44 : 0) : undefined
  const SortIcon = sort.dir === 'asc' ? ChevronUp : ChevronDown

  return (
    <div className="space-y-2">
      {selection && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
          <span className="text-fg-heading tabular-nums">{selected.length} selected</span>
          <button type="button" onClick={clear} className="min-h-8 rounded px-1 text-fg-muted hover:text-fg-heading">Clear</button>
          <div className="flex flex-wrap gap-2 sm:ml-auto">{selection.actions(selected, clear)}</div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
        <table className={cn('w-full caption-bottom text-sm', widths && 'table-fixed')} style={tableWidth ? { width: tableWidth, minWidth: '100%' } : undefined}>
          <thead>
            <tr className="border-b border-line">
              {selection && (
                <th className="w-11 px-3 align-middle">
                  <Checkbox
                    aria-label={allSelected ? 'Clear selection' : 'Select all'}
                    disabled={rows.length === 0}
                    checked={allSelected ? true : selected.length ? 'indeterminate' : false}
                    onCheckedChange={() => (allSelected ? clear() : setPicked(rows.map((r) => r.id)))}
                  />
                </th>
              )}
              {visible.map((c) => {
                const active = sort.key === c.key
                const label = (
                  <>
                    {c.label}
                    {active ? <SortIcon className="size-3.5 text-brand" aria-hidden /> : c.sortable && <ChevronDown className="size-3.5 opacity-0 transition-opacity group-hover/sort:opacity-60" aria-hidden />}
                  </>
                )
                const sortClass = 'group/sort -mx-1 inline-flex min-h-8 items-center gap-1 rounded px-1 hover:text-fg-heading'
                return (
                  <th
                    key={c.key}
                    ref={(el) => { if (el) ths.current.set(c.key, el); else ths.current.delete(c.key) }}
                    style={widths ? { width: widths[c.key] ?? MIN_WIDTH * 2 } : undefined}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn('group/th relative h-11 px-3 text-left align-middle font-medium whitespace-nowrap text-fg-muted', c.className)}
                  >
                    {!c.sortable ? c.label : serverSort ? (
                      <Link href={sortHref(c)} scroll={false} className={sortClass}>{label}</Link>
                    ) : (
                      <button type="button" onClick={() => setLocal({ key: c.key, dir: nextDir(c) })} className={sortClass}>{label}</button>
                    )}
                    {/* Resize grip straddling the column edge; the divider lights up on hover. */}
                    <span aria-hidden onPointerDown={(e) => startResize(e, c.key)} className="group/grip absolute top-0 -right-1.5 z-[2] flex h-full w-3 cursor-col-resize touch-none justify-center select-none">
                      <span className="my-auto h-1/2 w-px bg-line transition-all group-hover/th:bg-fg-faint group-hover/grip:h-full group-hover/grip:w-0.5 group-hover/grip:bg-brand group-active/grip:h-full group-active/grip:w-0.5 group-active/grip:bg-brand" />
                    </span>
                  </th>
                )
              })}
              <th className="sticky right-0 w-11 px-1 text-right">
                {hideable.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label="Table columns" title="Show, hide or reset columns" className="inline-grid size-8 place-items-center rounded-lg text-fg-faint transition-colors hover:bg-surface-hover hover:text-fg-heading">
                      <Columns3 className="size-4" aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      {hideable.map((c) => (
                        <DropdownMenuCheckboxItem
                          key={c.key}
                          checked={isShown(c)}
                          // Keep at least one hideable column.
                          disabled={isShown(c) && hideable.filter(isShown).length <= 1}
                          onCheckedChange={() => toggle(c)}
                          onSelect={(e) => e.preventDefault()}
                        >
                          {c.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled={!layout.widths && !layout.visible} onSelect={() => write(storageKey, {})}>Reset columns</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => (
              <tr key={r.id} className={cn('border-b border-line transition-colors last:border-0 hover:bg-surface-hover/50', r.className)}>
                {selection && (
                  <td className="px-3 py-2.5 align-middle">
                    {/* onClick (not onCheckedChange) to see shiftKey; preventDefault on mousedown stops shift from selecting text. */}
                    <Checkbox aria-label="Select row" checked={selected.includes(r.id)} onMouseDown={(e) => e.shiftKey && e.preventDefault()} onClick={(e) => pick(e, r.id)} />
                  </td>
                )}
                {visible.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2.5 align-middle', c.className, widths && 'overflow-hidden text-ellipsis')}>{r.cells[c.key]}</td>
                ))}
                <td />
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={visible.length + 1 + (selection ? 1 : 0)} className="py-12 text-center text-fg-muted">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

