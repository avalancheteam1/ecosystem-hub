import type { LocalProgress } from './schemas'

/** Hand-written twin of `localProgressSchema` (schemas.ts) - keeps zod out of the browser bundle. Keep both in sync. */
export function parseLocalProgress(v: unknown): LocalProgress | null {
  const visits = (v as { visits?: unknown } | null)?.visits
  if (typeof v !== 'object' || v === null || typeof visits !== 'object' || visits === null || Array.isArray(visits)) return null
  const entries = Object.entries(visits)
  if (entries.length > 1000) return null
  for (const [k, n] of entries) if (k.length > 400 || !Number.isSafeInteger(n) || (n as number) < 0) return null
  return { visits: Object.fromEntries(entries) as LocalProgress['visits'] }
}

// Signed-out lesson visits, kept in this browser until the user signs in (then synced and cleared, SyncLocalProgress).
// Storage can be missing or blocked (private mode) - every access is wrapped; losing it only loses unsynced progress.
const storageKey = (academy: string) => `team1-education:${academy}`

export function readLocalProgress(academy: string): LocalProgress | null {
  try {
    const raw = localStorage.getItem(storageKey(academy))
    return raw ? parseLocalProgress(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function update(academy: string, fn: (p: LocalProgress) => void) {
  try {
    const p = readLocalProgress(academy) ?? { visits: {} }
    fn(p)
    localStorage.setItem(storageKey(academy), JSON.stringify(p))
  } catch {}
}

export const saveLocalVisit = (academy: string, lesson: string) => update(academy, (p) => void (p.visits[lesson] = Date.now()))

export function clearLocalProgress(academy: string) {
  try {
    localStorage.removeItem(storageKey(academy))
  } catch {}
}
