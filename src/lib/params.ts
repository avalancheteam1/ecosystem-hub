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
