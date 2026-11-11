/**
 * Pure notification rules for security events: decides what is captured and
 * when a human gets alerted, so a typo-prone university or a bot never pages
 * anyone, while a real attack does (once).
 *
 * ponytail: state is in-memory per process and resets on deploy; move it to
 * DB/Redis when the web service scales out. Stale entries are swept
 * opportunistically (like src/lib/rate-limit.ts) so the Maps stay bounded.
 */

export type SecurityEventType =
  | 'auth.otp.failed'
  | 'auth.otp.cooldown'
  | 'auth.otp.daily_cap'
  | 'auth.captcha.failed'
  | 'auth.2fa.failed'
  | 'auth.2fa.locked'
  | 'auth.pending.blocked'
  | 'auth.ratelimited'
  | 'action.forbidden'
  | 'action.unauthenticated'
  | 'action.invalid_input'
  | 'page.denied'
  | 'api.key.malformed'
  | 'api.key.invalid'
  | 'api.key.revoked'
  | 'api.scope.denied'
  | 'api.ratelimited'
  | 'redirect.rejected'

export type Alert = { title: string; message: string; priority: number }

const MIN = 60_000
const HOUR = 60 * MIN
const ALERT_CAP = 20
const CAPTURE_CAP = 50

const PER_TARGET: Partial<Record<SecurityEventType, { limit: number; windowMs: number }>> = {
  'auth.otp.failed': { limit: 10, windowMs: 15 * MIN },
  'auth.2fa.failed': { limit: 5, windowMs: 15 * MIN },
  // Not immediate: a viewer clicking an owner-only button must not page anyone or eat the hourly alert cap.
  'action.forbidden': { limit: 5, windowMs: 15 * MIN },
  // Forms show server validation errors, so a few per user are normal; a burst means hand-crafted calls.
  'action.invalid_input': { limit: 20, windowMs: 15 * MIN },
}
const GLOBAL = { type: 'auth.otp.failed', name: 'Security: otp spraying', limit: 500, windowMs: 10 * MIN } as const
const IMMEDIATE = new Set<SecurityEventType>([
  'auth.2fa.locked',
  'auth.otp.daily_cap',
  'api.key.invalid',
  'api.key.revoked',
  'api.scope.denied',
])

/** Hits inside the sliding window, capped at `limit`: keeps at most `limit` timestamps per key, so each event is O(limit). */
function hit(map: Map<string, number[]>, key: string, now: number, windowMs: number, limit: number): number {
  const times = map.get(key) ?? []
  while (times.length && times[0] <= now - windowMs) times.shift()
  times.push(now)
  if (times.length > limit) times.shift()
  map.set(key, times)
  return times.length
}

export function createSecurityGate() {
  const hits = new Map<string, number[]>()
  const lastAlert = new Map<string, number>()
  const captured = new Map<string, { start: number; count: number }>()
  let alertWindow = { start: 0, count: 0 }
  let nextSweepAt = 0

  function sweep(now: number) {
    if (now < nextSweepAt) return
    nextSweepAt = now + 15 * MIN
    for (const [k, times] of hits) if (times[times.length - 1] <= now - 15 * MIN) hits.delete(k)
    for (const [k, at] of lastAlert) if (at <= now - HOUR) lastAlert.delete(k)
    for (const [k, c] of captured) if (c.start <= now - HOUR) captured.delete(k)
  }

  /** Applies the per-(rule, target) dedupe and the global hourly cap (priority-5 alerts bypass the cap). */
  function emit(rule: string, target: string, alert: Alert, now: number): Alert | null {
    const dedupeKey = `${rule}|${target}`
    const last = lastAlert.get(dedupeKey)
    if (last !== undefined && now - last < HOUR) return null
    if (alert.priority >= 5) {
      lastAlert.set(dedupeKey, now)
      return alert
    }
    if (now - alertWindow.start >= HOUR) alertWindow = { start: now, count: 0 }
    alertWindow.count += 1
    if (alertWindow.count > ALERT_CAP + 1) return null
    if (alertWindow.count === ALERT_CAP + 1) {
      return {
        title: 'Security alerts suppressed',
        message: `More than ${ALERT_CAP} security alerts in an hour, further ones are muted until it ends. See GlitchTip.`,
        priority: 3,
      }
    }
    lastAlert.set(dedupeKey, now)
    return alert
  }

  return {
    evaluate(type: SecurityEventType, target: string | undefined, now: number): { capture: boolean; alert: Alert | null } {
      sweep(now)
      const t = target ?? ''
      const short = t.slice(0, 8)
      const who = short ? ` for target ${short}` : ''

      let capture = true
      // Only immediate-alert types are always captured; the rest (incl. failed codes) stop at 50/type/hour.
      if (!IMMEDIATE.has(type)) {
        const c = captured.get(type)
        const cur = !c || now - c.start >= HOUR ? { start: now, count: 0 } : c
        cur.count += 1
        captured.set(type, cur)
        capture = cur.count <= CAPTURE_CAP
      }

      // Global spray rule first: it is the more serious one when both trip.
      if (type === GLOBAL.type) {
        const n = hit(hits, 'global|otp', now, GLOBAL.windowMs, GLOBAL.limit)
        if (n >= GLOBAL.limit) {
          const alert = emit(
            'global.otp',
            '',
            {
              title: GLOBAL.name,
              message: `${n} failed codes across accounts in ${GLOBAL.windowMs / MIN} min. See GlitchTip.`,
              priority: 5,
            },
            now,
          )
          if (alert) return { capture, alert }
        }
      }

      // No target = nothing to count per target; otherwise every anonymous event would share one bucket.
      const rule = PER_TARGET[type]
      if (rule && t) {
        const n = hit(hits, `${type}|${t}`, now, rule.windowMs, rule.limit)
        if (n >= rule.limit) {
          const alert = emit(
            type,
            t,
            {
              title: `Security: ${type}`,
              message: `${n} events in ${rule.windowMs / MIN} min${who}. See GlitchTip.`,
              priority: 3,
            },
            now,
          )
          return { capture, alert }
        }
      } else if (IMMEDIATE.has(type)) {
        const alert = emit(
          type,
          t,
          {
            title: `Security: ${type}`,
            message: `1 event${who}. See GlitchTip.`,
            priority: type === 'auth.2fa.locked' ? 5 : 3,
          },
          now,
        )
        return { capture, alert }
      }
      return { capture, alert: null }
    },
  }
}

/** Better Auth answers failed captchas and its own rate limit before any hook runs; the auth route maps those responses here. */
export function authResponseEvent(status: number, code: unknown): SecurityEventType | null {
  if (status === 429) return 'auth.ratelimited'
  if ((status === 400 || status === 403) && (code === 'MISSING_RESPONSE' || code === 'VERIFICATION_FAILED')) return 'auth.captcha.failed'
  return null
}
