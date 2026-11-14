// Pure, isomorphic rules for the tooling area (tested in tests/tooling.test.ts).

export type ToolCategory = { slug: string; label: string }
export type ToolLink = { label: string; url: string }
/**
 * One community tool, listed in `_content/tools.json`.
 * `licence: null` = the repo has no licence file. `logo`: a file under `public/tooling/`, e.g. `/tooling/evalanche.png`.
 * `checked`: the date (YYYY-MM-DD) someone last read the repo and docs. The first link is the main button.
 */
export type Tool = {
  slug: string
  name: string
  category: string
  purpose: string
  builder: { name: string; url?: string }
  licence: string | null
  language: string | null
  install: string | null
  note: string | null
  logo?: string
  links: ToolLink[]
  checked: string
}
export type ToolingContent = { categories: ToolCategory[]; tools: Tool[]; official: ToolLink[] }

export const PAGE_SIZE = 12 // divisible by the 2/3-column grid
export const QUERY_MAX = 80

export const toolHref = (t: Pick<Tool, 'slug'>) => `/tooling/${t.slug}`

/** Lower-case and strip accents, so "evalanche" finds "Évalanche" and the other way round. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()

/** Every word of the query must appear in the name, purpose, builder, category or language. */
export function matchesQuery(tool: Tool, categoryLabel: string, q: string | undefined): boolean {
  const words = fold(q ?? '').split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fold([tool.name, tool.purpose, tool.builder.name, categoryLabel, tool.language ?? ''].join(' '))
  return words.every((w) => hay.includes(w))
}

/**
 * The list page's view of the content for `?q=&category=&page=`.
 * Chips are the categories that have tools, counted within the search. A picked category stays picked even when the
 * search finds nothing in it; an unknown category (or one without tools) means "all". The page is clamped to the last one.
 */
export function viewTools(content: ToolingContent, opts: { q?: string; category?: string; page: number }) {
  const labels = new Map(content.categories.map((c) => [c.slug, c.label]))
  const found = content.tools.filter((t) => matchesQuery(t, labels.get(t.category) ?? '', opts.q))
  const chips = content.categories
    .filter((c) => content.tools.some((t) => t.category === c.slug))
    .map((c) => ({ ...c, count: found.filter((t) => t.category === c.slug).length }))
  const category = chips.some((c) => c.slug === opts.category) ? opts.category : undefined
  const shown = category ? found.filter((t) => t.category === category) : found
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, opts.page), pages)
  return {
    found: found.length,
    shown: shown.length,
    chips,
    category,
    page,
    hasMore: page < pages,
    tools: shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  }
}

/** List-page address, keeping only the params that are set. */
export function listHref(opts: { q?: string; category?: string }) {
  const p = new URLSearchParams()
  if (opts.q) p.set('q', opts.q)
  if (opts.category) p.set('category', opts.category)
  return p.size ? `/tooling?${p}` : '/tooling'
}

/** Up to `n` other tools from the same category, in list order. */
export function relatedTools(tools: Tool[], tool: Tool, n = 3) {
  return tools.filter((t) => t.category === tool.category && t.slug !== tool.slug).slice(0, n)
}

/** Two-letter fallback when a tool has no logo: "AVAX Toolkit" → "AT", "Wolfie" → "WO". */
export function initials(name: string) {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? parts[0][1] ?? '')).toUpperCase()
}
