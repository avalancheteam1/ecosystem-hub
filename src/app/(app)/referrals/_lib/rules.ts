// Pure referral rules (no DB, no server imports): used by src/proxy.ts (cookie),
// the sign-up hook (attribute.ts), actions and pages. Tested in tests/referrals.test.ts.

export const REF_COOKIE = 'ref'
export const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30
export const MAX_CODES_PER_USER = 10

const CODE_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/
const RESERVED = new Set(['admin', 'api', 'hub', 'team1', 'avalanche', 'ref', 'null', 'undefined'])

/** Lower-cased code, or null when the format is wrong or the word is reserved. */
export function normalizeCode(input: string | null | undefined): string | null {
  const code = (input ?? '').trim().toLowerCase()
  return CODE_RE.test(code) && !RESERVED.has(code) ? code : null
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no i/l/o/0/1 — readable when spoken
/** 8 random chars; uniqueness is the DB's job (the caller retries on P2002). */
export function generateCode(): string {
  // ponytail: modulo bias over 31 chars is irrelevant for non-secret codes.
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** First code wins: the value to store, or null to leave the cookie alone. */
export function shouldSetRefCookie(existing: string | undefined, param: string | null): string | null {
  return existing ? null : normalizeCode(param)
}

export function canAttribute<C extends { userId: string; active: boolean }>(code: C | null, newUserId: string): code is C {
  return !!code && code.active && code.userId !== newUserId
}

export type StatRow = { createdAt: Date; referrerId: string }
export type ReferralStats = {
  total: number
  perMonth: { month: string; count: number }[]
  perReferrer: { referrerId: string; count: number }[]
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7)

/** Totals, the last `months` UTC months (oldest first, zeros included) and counts per referrer (desc). */
export function referralStats(rows: StatRow[], now: Date, months = 12): ReferralStats {
  const perMonth = Array.from({ length: months }, (_, i) => ({
    month: monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1))),
    count: 0,
  }))
  const byMonth = new Map(perMonth.map((m) => [m.month, m]))
  const byReferrer = new Map<string, number>()
  for (const r of rows) {
    const m = byMonth.get(monthKey(r.createdAt))
    if (m) m.count++
    byReferrer.set(r.referrerId, (byReferrer.get(r.referrerId) ?? 0) + 1)
  }
  const perReferrer = [...byReferrer]
    .map(([referrerId, count]) => ({ referrerId, count }))
    .sort((a, b) => b.count - a.count || a.referrerId.localeCompare(b.referrerId))
  return { total: rows.length, perMonth, perReferrer }
}
