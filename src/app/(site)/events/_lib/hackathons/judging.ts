// Pure judging rules: conflicts of interest, weighted totals, ranking and
// reviewer assignment. Unit-tested in tests/judging.test.ts.

/** A judge may never review a project they're on - at submission time or now. Unbound judges (no user yet) can't conflict. */
export function isConflicted(judgeUserId: string | null, teamSnapshotUserIds: string[], currentMemberIds: string[]): boolean {
  if (!judgeUserId) return false
  return teamSnapshotUserIds.includes(judgeUserId) || currentMemberIds.includes(judgeUserId)
}

/** Weighted score on 0–100 (2 decimals); null unless every criterion has a valid score. */
export function weightedTotal(scores: Record<string, unknown>, criteria: { id: string; weight: number }[], scaleMax: number): number | null {
  if (!criteria.length) return null
  let sum = 0
  let weights = 0
  for (const c of criteria) {
    const v = scores[c.id]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > scaleMax) return null
    sum += v * c.weight
    weights += c.weight
  }
  return Math.round((sum / weights / scaleMax) * 100 * 100) / 100
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** Average raw score per criterion over the given reviews' scores (null when nobody scored it). */
export function criterionMeans(scores: Record<string, unknown>[], criteria: { id: string }[]): Record<string, number | null> {
  return Object.fromEntries(
    criteria.map((c) => {
      const xs = scores.map((s) => s[c.id]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      return [c.id, xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null]
    }),
  )
}

export type Ranked = { entryId: string; rank: number | null; mean: number | null; median: number | null; min: number | null; max: number | null; reviews: number }

/** Rank by mean total; ties → higher median → more reviews → earlier submission. Unreviewed entries come last, unranked. */
export function rankEntries(entries: { entryId: string; submittedAt: Date; totals: number[] }[]): Ranked[] {
  const scored = entries
    .map((e) => ({
      ...e,
      mean: e.totals.length ? round2(e.totals.reduce((a, b) => a + b, 0) / e.totals.length) : null,
      median: e.totals.length ? round2(median(e.totals)) : null,
    }))
    .sort((a, b) => {
      if (a.mean == null || b.mean == null) return a.mean == null ? (b.mean == null ? 0 : 1) : -1
      return b.mean - a.mean || b.median! - a.median! || b.totals.length - a.totals.length || a.submittedAt.getTime() - b.submittedAt.getTime()
    })
  return scored.map((e, i) => ({
    entryId: e.entryId,
    rank: e.mean == null ? null : i + 1,
    mean: e.mean,
    median: e.median,
    min: e.totals.length ? Math.min(...e.totals) : null,
    max: e.totals.length ? Math.max(...e.totals) : null,
    reviews: e.totals.length,
  }))
}

type AssignEntry = { id: string; trackIds: string[]; teamUserIds: string[] }
type AssignJudge = { id: string; userId: string | null; trackIds: string[] }
export type Pair = [judgeId: string, entryId: string]

/** An entry's tracks as eligibility sees them: with the stage's "same track only" off, track-limited judges may review any entry. */
export const entryTracks = (trackIds: string[], sameTrackOnly: boolean) => (sameTrackOnly ? trackIds : [])

/** Can this judge review this entry - and if not, why (shown to organisers)? */
export function judgeEligibility(j: AssignJudge, e: AssignEntry, declared: Pair[]): { ok: true } | { ok: false; reason: string } {
  if (isConflicted(j.userId, e.teamUserIds, [])) return { ok: false, reason: 'On this team' }
  if (declared.some(([jj, ee]) => jj === j.id && ee === e.id)) return { ok: false, reason: 'Declared a conflict' }
  if (j.trackIds.length && e.trackIds.length && !e.trackIds.some((t) => j.trackIds.includes(t))) return { ok: false, reason: 'Judges other tracks only' }
  return { ok: true }
}

function eligible(j: AssignJudge, e: AssignEntry) {
  return judgeEligibility(j, e, []).ok
}

/** `exclude`: pairs that must never be drawn again (declared conflicts). */
export function assignAll(entries: AssignEntry[], judges: AssignJudge[], exclude: Pair[] = []): Pair[] {
  const banned = new Set(exclude.map(([j, e]) => `${j}:${e}`))
  return entries.flatMap((e) => judges.filter((j) => eligible(j, e) && !banned.has(`${j.id}:${e.id}`)).map((j): Pair => [j.id, e.id]))
}

/** Deterministic PRNG (mulberry32) seeded from a string. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  let a = (h << 13) | (h >>> 19)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Give every entry exactly `n` distinct eligible judges, balancing load.
 * `keep` = pairs that must stay (already reviewed); they count toward n and load.
 * `exclude` = pairs never to draw (declared conflicts); they don't count.
 * Entries with the fewest eligible judges are filled first; among eligible
 * judges the least loaded win, ties broken by a seeded shuffle.
 */
export function assignRandom(
  entries: AssignEntry[],
  judges: AssignJudge[],
  n: number,
  opts: { seed: string; keep?: Pair[]; exclude?: Pair[] },
): { ok: true; pairs: Pair[] } | { ok: false; infeasible: string[] } {
  const random = rng(opts.seed)
  const tiebreak = new Map(judges.map((j) => [j.id, random()]))
  const load = new Map(judges.map((j) => [j.id, 0]))
  const assigned = new Map(entries.map((e) => [e.id, new Set<string>()]))
  const pairs: Pair[] = []
  for (const [j, e] of opts.keep ?? []) {
    if (!assigned.has(e) || !load.has(j)) continue
    assigned.get(e)!.add(j)
    load.set(j, load.get(j)! + 1)
    pairs.push([j, e])
  }
  const banned = new Set((opts.exclude ?? []).map(([j, e]) => `${j}:${e}`))
  const pool = new Map(entries.map((e) => [e.id, judges.filter((j) => eligible(j, e) && !banned.has(`${j.id}:${e.id}`))]))
  const infeasible = entries.filter((e) => pool.get(e.id)!.length < n).map((e) => e.id)
  if (infeasible.length) return { ok: false, infeasible }

  const order = [...entries].sort((a, b) => pool.get(a.id)!.length - pool.get(b.id)!.length || a.id.localeCompare(b.id))
  for (const e of order) {
    const have = assigned.get(e.id)!
    while (have.size < n) {
      const pick = pool
        .get(e.id)!
        .filter((j) => !have.has(j.id))
        .sort((a, b) => load.get(a.id)! - load.get(b.id)! || tiebreak.get(a.id)! - tiebreak.get(b.id)!)[0]
      if (!pick) return { ok: false, infeasible: [e.id] }
      have.add(pick.id)
      load.set(pick.id, load.get(pick.id)! + 1)
      pairs.push([pick.id, e.id])
    }
  }
  return { ok: true, pairs }
}
