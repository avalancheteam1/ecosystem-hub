import { test } from 'vitest'
import assert from 'node:assert/strict'
import { byUrgency, hackathonMoment } from '@/app/(app)/dashboard/_lib/highlights'

const now = new Date('2026-10-09T12:00:00Z')
const d = (s: string) => new Date(s)
const r1 = { id: 'r1', name: 'Round 1', opensAt: d('2026-10-01'), closesAt: d('2026-10-12'), judgingClosedAt: null }
const r2 = { id: 'r2', name: 'Finals', opensAt: d('2026-10-20'), closesAt: d('2026-10-25'), judgingClosedAt: null }
const start = d('2026-10-01')

test('hackathonMoment: open stage wins, counts down to its close', () => {
  assert.deepEqual(hackathonMoment([r1, r2], null, start, new Set(['r1']), now), { state: 'open', stage: 'Round 1', at: r1.closesAt, submitted: true })
})

test('hackathonMoment: next upcoming stage once the open one is closed for judging', () => {
  const judged = { ...r1, judgingClosedAt: d('2026-10-08') }
  assert.deepEqual(hackathonMoment([judged, r2], null, start, new Set(), now), { state: 'upcoming', stage: 'Finals', at: r2.opensAt, submitted: false })
})

test('hackathonMoment: judging, then results for 30 days, then gone', () => {
  const closed = { ...r1, closesAt: d('2026-10-05') }
  assert.equal(hackathonMoment([closed], null, start, new Set(), now)?.state, 'judging')
  const done = { ...closed, judgingClosedAt: d('2026-10-06') }
  assert.equal(hackathonMoment([done], d('2026-10-07'), start, new Set(['r1']), now)?.state, 'results')
  assert.equal(hackathonMoment([done], d('2026-08-01'), start, new Set(), now), null)
})

test('hackathonMoment: no stages yet counts down to the event start', () => {
  assert.deepEqual(hackathonMoment([], null, d('2026-11-01'), new Set(), now), { state: 'upcoming', stage: null, at: d('2026-11-01'), submitted: false })
  assert.equal(hackathonMoment([], null, start, new Set(), now), null)
})

test('byUrgency: open before upcoming, soonest first', () => {
  const m = (state: 'open' | 'upcoming', at: string) => ({ state, at: d(at), stage: null, submitted: false })
  const sorted = [m('upcoming', '2026-10-10'), m('open', '2026-10-20'), m('open', '2026-10-11')].sort(byUrgency)
  assert.deepEqual(sorted.map((x) => [x.state, x.at.toISOString().slice(0, 10)]), [['open', '2026-10-11'], ['open', '2026-10-20'], ['upcoming', '2026-10-10']])
})

test('byActivity: active by last update, archived last', async () => {
  const { byActivity } = await import('@/app/(app)/dashboard/_lib/highlights')
  const p = (id: string, maturity: string | null, at: string) => ({ id, maturity, updatedAt: d(at) })
  const sorted = [p('old', 'mvp', '2026-09-01'), p('arch', 'archived', '2026-10-08'), p('new', 'live', '2026-10-05'), p('unset', null, '2026-09-15')].sort(byActivity)
  assert.deepEqual(sorted.map((x) => x.id), ['new', 'unset', 'old', 'arch'])
})
