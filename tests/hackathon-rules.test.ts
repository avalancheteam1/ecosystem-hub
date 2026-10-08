import { test } from 'vitest'
import assert from 'node:assert/strict'
import { buildAnswersSchema, canJoin, canManageHackathon, publishChecklist, registrationStatus, stageState, validateStages, type FieldDef } from '@/app/(site)/events/_lib/hackathons/rules'

const d = (s: string) => new Date(s)
const stage = (o: Partial<{ opensAt: Date; closesAt: Date; judgingClosedAt: Date | null; name: string; order: number }> = {}) => ({
  name: 'Round 1', order: 0, opensAt: d('2026-11-01T00:00Z'), closesAt: d('2026-11-10T00:00Z'), judgingClosedAt: null, ...o,
})

test('stageState walks upcoming → open → judging → closed', () => {
  const s = stage()
  assert.equal(stageState(s, d('2026-10-31T23:59Z')), 'upcoming')
  assert.equal(stageState(s, d('2026-11-01T00:00Z')), 'open')
  assert.equal(stageState(s, d('2026-11-10T00:00Z')), 'judging') // closesAt is exclusive
  assert.equal(stageState({ ...s, judgingClosedAt: d('2026-11-12T00:00Z') }, d('2026-11-11T00:00Z')), 'closed')
})

test('validateStages: windows must be valid, ordered and non-overlapping', () => {
  assert.deepEqual(validateStages([stage(), stage({ name: 'Finals', order: 1, opensAt: d('2026-11-15T00:00Z'), closesAt: d('2026-11-20T00:00Z') })]), [])
  assert.match(validateStages([stage({ closesAt: d('2026-10-01T00:00Z') })])[0]!, /closes before it opens/)
  assert.match(validateStages([stage(), stage({ name: 'Finals', order: 1, opensAt: d('2026-11-05T00:00Z'), closesAt: d('2026-11-20T00:00Z') })])[0]!, /overlaps/)
})

const fields: FieldDef[] = [
  { id: 'f1', label: 'Role', type: 'select', required: true, options: ['Dev', 'Design'], maxLength: null },
  { id: 'f2', label: 'Why', type: 'long_text', required: false, options: [], maxLength: 50 },
  { id: 'f3', label: 'Site', type: 'url', required: false, options: [], maxLength: null },
  { id: 'f4', label: 'Skills', type: 'multi_select', required: true, options: ['A', 'B', 'C'], maxLength: null },
  { id: 'f5', label: 'Agree', type: 'checkbox', required: true, options: [], maxLength: null },
  { id: 'f6', label: 'Years', type: 'number', required: false, options: [], maxLength: null },
]

test('answers schema enforces required, options, length, url scheme and strips unknown keys', () => {
  const s = buildAnswersSchema(fields)
  const ok = s.safeParse({ f1: 'Dev', f2: '', f3: '', f4: ['A', 'C'], f5: true, f6: '3', extra: 'x' })
  assert.equal(ok.success, true)
  assert.deepEqual(ok.success && ok.data, { f1: 'Dev', f2: null, f3: null, f4: ['A', 'C'], f5: true, f6: 3 })
  assert.equal(s.safeParse({ f1: 'CEO', f4: ['A'], f5: true }).success, false) // not an option
  assert.equal(s.safeParse({ f1: 'Dev', f4: [], f5: true }).success, false) // required multi
  assert.equal(s.safeParse({ f1: 'Dev', f4: ['A'], f5: false }).success, false) // required checkbox must be ticked
  assert.equal(s.safeParse({ f1: 'Dev', f4: ['A'], f5: true, f2: 'x'.repeat(51) }).success, false)
  assert.equal(s.safeParse({ f1: 'Dev', f4: ['A'], f5: true, f3: 'javascript:alert(1)' }).success, false)
  assert.equal(s.safeParse({ f1: 'Dev', f4: ['Z'], f5: true }).success, false)
})

const hack = { status: 'published', registrationOpensAt: d('2026-10-01T00:00Z'), registrationClosesAt: d('2026-10-30T00:00Z'), maxParticipants: 2, termsUrl: 'https://t.io' }

test('canJoin checks publish state, window, cap, terms and duplicates', () => {
  const now = d('2026-10-15T00:00Z')
  assert.deepEqual(canJoin(hack, { now, participants: 1, existing: null, invited: false, acceptedTerms: true }), { ok: true })
  assert.equal(canJoin({ ...hack, status: 'draft' }, { now, participants: 0, existing: null, invited: false, acceptedTerms: true }).ok, false)
  assert.equal(canJoin(hack, { now: d('2026-10-31T00:00Z'), participants: 0, existing: null, invited: false, acceptedTerms: true }).ok, false)
  assert.equal(canJoin(hack, { now: d('2026-09-30T00:00Z'), participants: 0, existing: null, invited: false, acceptedTerms: true }).ok, false)
  assert.equal(canJoin(hack, { now, participants: 2, existing: null, invited: false, acceptedTerms: true }).ok, false)
  assert.equal(canJoin(hack, { now, participants: 0, existing: null, invited: false, acceptedTerms: false }).ok, false)
  assert.equal(canJoin(hack, { now, participants: 0, existing: 'active', invited: false, acceptedTerms: true }).ok, false)
  assert.equal(canJoin({ ...hack, termsUrl: null, maxParticipants: null, registrationOpensAt: null, registrationClosesAt: null }, { now, participants: 99, existing: null, invited: false, acceptedTerms: false }).ok, true)
})

test('canJoin: pending waits, rejected is final unless invited, withdrawn may re-register', () => {
  const now = d('2026-10-15T00:00Z')
  const c = { now, participants: 0, invited: false, acceptedTerms: true }
  assert.equal(canJoin(hack, { ...c, existing: 'pending' }).ok, false)
  assert.equal(canJoin(hack, { ...c, existing: 'pending', invited: true }).ok, false)
  assert.equal(canJoin(hack, { ...c, existing: 'rejected' }).ok, false)
  assert.equal(canJoin(hack, { ...c, existing: 'rejected', invited: true }).ok, true)
  assert.equal(canJoin(hack, { ...c, existing: 'withdrawn' }).ok, true)
  // The invite link skips approval only — not the cap.
  assert.equal(canJoin(hack, { ...c, participants: 2, existing: null, invited: true }).ok, false)
})

test('registrationStatus: approval needed unless invited', () => {
  assert.equal(registrationStatus(false, false), 'active')
  assert.equal(registrationStatus(true, false), 'pending')
  assert.equal(registrationStatus(true, true), 'active')
})

test('canManageHackathon: global permission or bound organiser', () => {
  const base = { id: 'u1', isSuperAdmin: false, permissions: new Set<never>() }
  assert.equal(canManageHackathon(base, [{ userId: 'u1' }]), true)
  assert.equal(canManageHackathon(base, [{ userId: 'u2' }, { userId: null }]), false)
  assert.equal(canManageHackathon({ ...base, permissions: new Set(['hackathons.manage'] as never) }, []), true)
  assert.equal(canManageHackathon(null, [{ userId: null }]), false)
})

test('publishChecklist lists what blocks publishing', () => {
  const ok = { tagline: 'x', teamSizeMin: 1, teamSizeMax: 4, eventPublished: true, stages: [{ ...stage(), criteria: [{ weight: 1 }], reviewMode: 'all', judgesPerSubmission: null }] }
  assert.deepEqual(publishChecklist(ok), [])
  const bad = publishChecklist({ ...ok, tagline: '', teamSizeMin: 5, teamSizeMax: 2, eventPublished: false, stages: [{ ...ok.stages[0]!, criteria: [], reviewMode: 'random', judgesPerSubmission: null }] })
  assert.equal(bad.length, 5)
  assert.deepEqual(publishChecklist({ ...ok, stages: [] }), ['Add at least one stage'])
})
