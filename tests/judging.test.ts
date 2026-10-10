import { test } from 'vitest'
import assert from 'node:assert/strict'
import { assignAll, assignRandom, isConflicted, rankEntries, weightedTotal } from '@/app/(site)/events/_lib/hackathons/judging'

const criteria = [{ id: 'tech', weight: 2 }, { id: 'ux', weight: 1 }, { id: 'impact', weight: 1 }]

test('weighted total scales to 0–100 and needs every criterion', () => {
  assert.equal(weightedTotal({ tech: 10, ux: 10, impact: 10 }, criteria, 10), 100)
  assert.equal(weightedTotal({ tech: 8, ux: 4, impact: 6 }, criteria, 10), 65) // (16+4+6)/4 = 6.5 → 65
  assert.equal(weightedTotal({ tech: 8, ux: 4 }, criteria, 10), null)
  assert.equal(weightedTotal({ tech: 11, ux: 4, impact: 6 }, criteria, 10), null) // out of range
  assert.equal(weightedTotal({ tech: 7, ux: 3, impact: 3 }, criteria, 9), 55.56)
})

test('conflict of interest: on the submitted team or the current team', () => {
  assert.equal(isConflicted('u1', ['u1', 'u2'], []), true)
  assert.equal(isConflicted('u3', ['u1'], ['u3']), true)
  assert.equal(isConflicted('u9', ['u1'], ['u2']), false)
  assert.equal(isConflicted(null, ['u1'], ['u1']), false) // unbound judge - not yet a user
})

test('ranking: mean, then median, then review count, then earliest submission', () => {
  const ranked = rankEntries([
    { entryId: 'a', submittedAt: new Date('2026-01-02'), totals: [80, 60] }, // mean 70 median 70
    { entryId: 'b', submittedAt: new Date('2026-01-01'), totals: [70, 70, 70] }, // mean 70 median 70, 3 reviews
    { entryId: 'c', submittedAt: new Date('2026-01-01'), totals: [90] },
    { entryId: 'd', submittedAt: new Date('2026-01-01'), totals: [] },
    { entryId: 'e', submittedAt: new Date('2026-01-01'), totals: [70, 70] }, // same as a but earlier
  ])
  assert.deepEqual(ranked.map((r) => r.entryId), ['c', 'b', 'e', 'a', 'd'])
  assert.deepEqual([ranked[0]!.rank, ranked.at(-1)!.rank], [1, null])
  assert.deepEqual([ranked[3]!.min, ranked[3]!.max, ranked[3]!.mean], [60, 80, 70])
})

const judges = ['j1', 'j2', 'j3', 'j4', 'j5'].map((id) => ({ id, userId: `u-${id}`, trackIds: [] as string[] }))
const entries = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, trackIds: ['t1'], teamUserIds: [`member${i}`] }))

test('random assignment: exactly n distinct judges per entry, balanced load, deterministic per seed', () => {
  const r = assignRandom(entries, judges, 2, { seed: 'abc' })
  assert.ok(r.ok)
  if (!r.ok) return
  const byEntry = new Map<string, string[]>()
  const load = new Map<string, number>()
  for (const [j, e] of r.pairs) {
    byEntry.set(e, [...(byEntry.get(e) ?? []), j])
    load.set(j, (load.get(j) ?? 0) + 1)
  }
  for (const e of entries) {
    assert.equal(byEntry.get(e.id)!.length, 2)
    assert.equal(new Set(byEntry.get(e.id)).size, 2)
  }
  const loads = [...load.values()]
  assert.ok(Math.max(...loads) - Math.min(...loads) <= 1, `unbalanced ${loads}`)
  assert.deepEqual(assignRandom(entries, judges, 2, { seed: 'abc' }), r)
  assert.notDeepEqual(assignRandom(entries, judges, 2, { seed: 'xyz' }), r)
})

test('random assignment never assigns a conflicted judge and honours judge tracks', () => {
  const es = [
    { id: 'mine', trackIds: ['t1'], teamUserIds: ['u-j1'] },
    { id: 'other', trackIds: ['t2'], teamUserIds: [] },
  ]
  const js = [{ id: 'j1', userId: 'u-j1', trackIds: [] }, { id: 'j2', userId: 'u-j2', trackIds: ['t1'] }, { id: 'j3', userId: 'u-j3', trackIds: [] }]
  const r = assignRandom(es, js, 1, { seed: 's' })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.ok(!r.pairs.some(([j, e]) => j === 'j1' && e === 'mine'))
  assert.ok(!r.pairs.some(([j, e]) => j === 'j2' && e === 'other'))
})

test('random assignment fails clearly when an entry cannot get n eligible judges', () => {
  const r = assignRandom([{ id: 'x', trackIds: [], teamUserIds: ['u-j1'] }], judges.slice(0, 2), 2, { seed: 's' })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.deepEqual(r.infeasible, ['x'])
})

test('random assignment keeps reviewed pairs and only tops up', () => {
  const keep: [string, string][] = [['j1', 'e0']]
  const r = assignRandom(entries.slice(0, 1), judges, 2, { seed: 's', keep })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.ok(r.pairs.some(([j, e]) => j === 'j1' && e === 'e0'))
  assert.equal(r.pairs.length, 2)
})

test('assignAll pairs every eligible judge with every entry', () => {
  const pairs = assignAll([{ id: 'a', trackIds: [], teamUserIds: ['u-j1'] }, { id: 'b', trackIds: [], teamUserIds: [] }], judges.slice(0, 2))
  assert.deepEqual(pairs.sort(), [['j1', 'b'], ['j2', 'a'], ['j2', 'b']])
})

test('declared conflicts are excluded and do not count toward n', () => {
  const r = assignRandom(entries.slice(0, 1), judges, 2, { seed: 's', exclude: [['j1', 'e0'], ['j2', 'e0']] })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.ok(!r.pairs.some(([j]) => j === 'j1' || j === 'j2'))
  assert.equal(r.pairs.length, 2)
  assert.deepEqual(assignAll([{ id: 'a', trackIds: [], teamUserIds: [] }], judges.slice(0, 2), [['j1', 'a']]), [['j2', 'a']])
})

test('own-upload keys must be a uuid file directly under the owner prefix', async () => {
  const { isOwnUploadKey } = await import('@/lib/storage/keys')
  const id = '3f2a9c1e-1111-4222-8333-444455556666'
  assert.equal(isOwnUploadKey(`project-logos/p1/${id}.png`, 'project-logos', 'p1'), true)
  assert.equal(isOwnUploadKey(`project-logos/p1/../../avatars/u2/${id}.png`, 'project-logos', 'p1'), false)
  assert.equal(isOwnUploadKey(`project-logos/p1/sub/${id}.png`, 'project-logos', 'p1'), false)
  assert.equal(isOwnUploadKey(`project-logos/p1/${id}.svg`, 'project-logos', 'p1'), false)
})

test('eligibility explains why a judge cannot review an entry', async () => {
  const { judgeEligibility } = await import('@/app/(site)/events/_lib/hackathons/judging')
  const entry = { id: 'e', trackIds: ['t1'], teamUserIds: ['u-on-team'] }
  assert.deepEqual(judgeEligibility({ id: 'j', userId: 'u-on-team', trackIds: [] }, entry, []), { ok: false, reason: 'On this team' })
  assert.deepEqual(judgeEligibility({ id: 'j', userId: 'u', trackIds: ['t2'] }, entry, []), { ok: false, reason: 'Judges other tracks only' })
  assert.deepEqual(judgeEligibility({ id: 'j', userId: 'u', trackIds: [] }, entry, [['j', 'e']]), { ok: false, reason: 'Declared a conflict' })
  assert.deepEqual(judgeEligibility({ id: 'j', userId: null, trackIds: ['t1'] }, entry, []), { ok: true })
})
