// Search-param parsing for server pages. Next passes string | string[] | undefined
// (a repeated ?q=a&q=b becomes an array) — never call string methods on it raw.

type Param = string | string[] | undefined

/** First value, trimmed, capped at `max` chars; empty → undefined. */
export function textParam(v: Param, max = 100): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim().slice(0, max)
  return s || undefined
}

/** 1-based page number, capped so `skip` stays a sane integer. */
export function pageParam(v: Param, max = 10_000): number {
  const n = Number(Array.isArray(v) ? v[0] : v)
  if (!(n >= 1)) return 1 // NaN, 0, negatives
  if (n > max) return max
  return Number.isInteger(n) ? n : 1
}

/** Reads `?sort=&dir=` for a server-sorted `DataTable`; unknown keys fall back to `fallback`. */
export function sortParams<K extends string>(sp: { sort?: string | string[]; dir?: string | string[] }, keys: readonly K[], fallback: { key: K; dir: 'asc' | 'desc' }): { key: K; dir: 'asc' | 'desc' } {
  const key = typeof sp.sort === 'string' && (keys as readonly string[]).includes(sp.sort) ? (sp.sort as K) : null
  if (!key) return fallback
  return { key, dir: sp.dir === 'asc' ? 'asc' : 'desc' }
}
