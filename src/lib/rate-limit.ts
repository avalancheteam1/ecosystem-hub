/**
 * In-memory fixed-window rate limiter.
 *
 * Keyed by an arbitrary string (e.g. an IP address). Counts requests inside a
 * fixed time window and rejects once the limit is reached. State lives in a
 * module-level Map, so it is **per-process**: it resets on restart/redeploy and
 * is NOT shared across multiple instances.
 *
 * That's an accepted tradeoff for a lightweight first-line throttle on the
 * single-instance Railway (`output: 'standalone'`) deployment. It is
 * defense-in-depth layered on top of the captcha + uniform-response controls,
 * never the sole protection. If the app is ever scaled to multiple instances or
 * needs limits that survive restarts, move this to a shared store (DB/Redis).
 *
 * Expired windows are swept opportunistically (at most once per window) so the
 * Map can't grow without bound under a stream of distinct keys.
 */

interface Bucket {
  count: number
  /** epoch ms at which the current window ends and the count resets */
  resetAt: number
}

const buckets = new Map<string, Bucket>()
let nextSweepAt = 0

export interface RateLimitResult {
  ok: boolean
  /** Seconds to wait before retrying. Only meaningful when `ok` is false. */
  retryAfterSeconds: number
}

/**
 * Record a hit against `key` and report whether it is within `limit` for the
 * current `windowMs` window.
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now()

  // Opportunistic cleanup of expired buckets, bounded to once per window.
  if (now >= nextSweepAt) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k)
    }
    nextSweepAt = now + windowMs
  }

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) }
  }

  existing.count += 1
  return { ok: true, retryAfterSeconds: 0 }
}
