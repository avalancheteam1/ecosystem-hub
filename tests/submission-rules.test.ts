import { test } from 'vitest'
import assert from 'node:assert/strict'
import { canSubmitToStage } from '@/app/(site)/events/_lib/hackathons/submissions'

const now = new Date('2026-11-05T00:00Z')
const stage = { id: 's2', order: 1, opensAt: new Date('2026-11-01T00:00Z'), closesAt: new Date('2026-11-10T00:00Z'), judgingClosedAt: null }
const ok = {
  stage,
  isFirstStage: false,
  advancedFromPrevious: true,
  submissionStatus: 'active' as string | null,
  team: ['u1', 'u2'],
  activeParticipants: new Set(['u1', 'u2', 'u3']),
  teamSizeMin: 1,
  teamSizeMax: 3 as number | null,
  submitterId: 'u1',
  now,
}

test('a full, joined, advanced team may submit while the stage is open', () => {
  assert.deepEqual(canSubmitToStage(ok), { ok: true })
})

test('first stage needs no advancement and no prior submission', () => {
  assert.deepEqual(canSubmitToStage({ ...ok, isFirstStage: true, advancedFromPrevious: false, submissionStatus: null }), { ok: true })
})

const reason = (o: Partial<typeof ok>) => {
  const r = canSubmitToStage({ ...ok, ...o })
  return r.ok ? 'ok' : r.reason
}

test('refuses outside the window', () => {
  assert.match(reason({ now: new Date('2026-10-31T00:00Z') }), /not open yet/)
  assert.match(reason({ now: new Date('2026-11-10T00:00Z') }), /closed/)
})

test('later stages only for advanced teams', () => {
  assert.match(reason({ advancedFromPrevious: false }), /advanced/)
})

test('withdrawn or disqualified submissions are out', () => {
  assert.match(reason({ submissionStatus: 'withdrawn' }), /withdrawn/)
  assert.match(reason({ submissionStatus: 'disqualified' }), /disqualified/)
})

test('team size limits and every member must have joined', () => {
  assert.match(reason({ team: ['u1', 'u2', 'u3', 'u4'], activeParticipants: new Set(['u1', 'u2', 'u3', 'u4']) }), /at most 3/)
  assert.equal(reason({ teamSizeMax: null, team: ['u1', 'u2', 'u3', 'u4'], activeParticipants: new Set(['u1', 'u2', 'u3', 'u4']) }), 'ok')
  assert.match(reason({ teamSizeMin: 3 }), /at least 3/)
  assert.match(reason({ team: ['u1', 'u9'] }), /joined the hackathon/)
})

test('the submitter must be on the team', () => {
  assert.match(reason({ submitterId: 'u3' }), /team/)
})
