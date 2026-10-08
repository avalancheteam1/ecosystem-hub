import { test } from 'vitest'
import assert from 'node:assert/strict'
import { canAttribute, generateCode, normalizeCode, referralStats, shouldSetRefCookie } from '@/app/(app)/referrals/_lib/rules'
import { canViewGroup, chapterGroupSlug, countingGroups, isGroupLead, isStale, mergeGroups, normalizeTier, type GroupRef } from '@/lib/groups'
import type { Permission } from '@/lib/permissions'

test('codes are trimmed, lower-cased, 3–32 chars, no edge dashes, not reserved', () => {
  assert.equal(normalizeCode('  Hansi '), 'hansi')
  assert.equal(normalizeCode('accra-meetup-2026'), 'accra-meetup-2026')
  for (const bad of ['ab', '-abc', 'abc-', 'has space', 'x'.repeat(33), '<script>', 'admin', 'TEAM1', '', null, undefined]) {
    assert.equal(normalizeCode(bad), null, String(bad))
  }
})

test('generated codes are valid and differ', () => {
  const a = generateCode()
  assert.equal(normalizeCode(a), a)
  assert.equal(a.length, 8)
  assert.notEqual(a, generateCode())
})

test('the ref cookie is set only when absent and the param is valid (first code wins)', () => {
  assert.equal(shouldSetRefCookie(undefined, 'Hansi'), 'hansi')
  assert.equal(shouldSetRefCookie('first', 'second'), null)
  assert.equal(shouldSetRefCookie(undefined, 'a b'), null)
  assert.equal(shouldSetRefCookie(undefined, null), null)
})

test('attribution needs an active code owned by someone else', () => {
  assert.equal(canAttribute({ userId: 'u1', active: true }, 'u2'), true)
  assert.equal(canAttribute({ userId: 'u1', active: false }, 'u2'), false)
  assert.equal(canAttribute({ userId: 'u2', active: true }, 'u2'), false)
  assert.equal(canAttribute(null, 'u2'), false)
})

test('stats: total, 12 UTC months oldest first incl. zeros, referrers sorted by count', () => {
  const now = new Date('2026-10-15T00:00:00Z')
  const rows = [
    { createdAt: new Date('2026-10-01T00:00:00Z'), referrerId: 'a' },
    { createdAt: new Date('2026-09-30T23:59:59Z'), referrerId: 'b' },
    { createdAt: new Date('2026-10-02T00:00:00Z'), referrerId: 'b' },
    { createdAt: new Date('2024-01-01T00:00:00Z'), referrerId: 'b' }, // older than the window: in total, not in months
  ]
  const s = referralStats(rows, now)
  assert.equal(s.total, 4)
  assert.equal(s.perMonth.length, 12)
  assert.deepEqual(s.perMonth.at(0), { month: '2025-11', count: 0 })
  assert.deepEqual(s.perMonth.at(-2), { month: '2026-09', count: 1 })
  assert.deepEqual(s.perMonth.at(-1), { month: '2026-10', count: 2 })
  assert.deepEqual(s.perReferrer, [{ referrerId: 'b', count: 3 }, { referrerId: 'a', count: 1 }])
})

const g = (id: string, portalChapterSlug: string | null = null): GroupRef => ({ id, slug: id, name: id.toUpperCase(), portalChapterSlug })

test('mergeGroups: manual + linked portal chapters, lead if either says so, unlinked chapters dropped', () => {
  const africa = g('africa', 'africa')
  const devs = g('devs')
  const merged = mergeGroups(
    [{ group: africa, isLead: false }, { group: devs, isLead: true }],
    [{ slug: 'africa', name: 'Africa', lead: true }, { slug: 'unlinked', name: 'X', lead: true }],
    [africa],
  )
  assert.deepEqual(merged, [
    { group: africa, lead: true, sources: ['manual', 'portal'] },
    { group: devs, lead: true, sources: ['manual'] },
  ])
})

test('mergeGroups: portal down (no chapters) keeps manual groups', () => {
  assert.deepEqual(mergeGroups([{ group: g('devs'), isLead: false }], [], []), [{ group: g('devs'), lead: false, sources: ['manual'] }])
})

test('canViewGroup: referrals.view, super admin, or lead of that group', () => {
  const groups = mergeGroups([{ group: g('devs'), isLead: true }, { group: g('ops'), isLead: false }], [], [])
  const user = (perms: Permission[] = [], isSuperAdmin = false) => ({ isSuperAdmin, permissions: new Set(perms) })
  assert.equal(isGroupLead(groups, 'devs'), true)
  assert.equal(canViewGroup(user(), 'devs', groups), true)
  assert.equal(canViewGroup(user(), 'ops', groups), false)
  assert.equal(canViewGroup(user(['referrals.view']), 'ops', []), true)
  assert.equal(canViewGroup(user([], true), 'ops', []), true)
})

test('tiers: senior is reported as core, unknown values are dropped', () => {
  assert.equal(normalizeTier('member'), 'member')
  assert.equal(normalizeTier('senior'), 'core')
  assert.equal(normalizeTier('core'), 'core')
  assert.equal(normalizeTier('collaborator'), 'collaborator')
  assert.equal(normalizeTier('admin'), null)
  assert.equal(normalizeTier(null), null)
})

test('a stored portal copy is stale after 24 h or when missing', () => {
  const now = new Date('2026-10-08T12:00:00Z')
  assert.equal(isStale(null, now), true)
  assert.equal(isStale(new Date('2026-10-07T12:00:01Z'), now), false)
  assert.equal(isStale(new Date('2026-10-07T11:59:59Z'), now), true)
})

test('chapter group slug: chapter slug unless a manual group took it', () => {
  assert.equal(chapterGroupSlug('nigeria', new Set()), 'nigeria')
  assert.equal(chapterGroupSlug('nigeria', new Set(['nigeria'])), 'nigeria-chapter')
})

test('onboardings count for manual groups + only the primary chapter group', () => {
  const g = (id: string, ch: string | null, sources: ('manual' | 'portal')[]) => ({ group: { id, slug: id, name: id, portalChapterSlug: ch }, lead: false, sources })
  const groups = [g('a', 'a', ['portal']), g('b', 'b', ['portal']), g('m', null, ['manual'])]
  const ids = (x: ReturnType<typeof countingGroups>) => x.map((y) => y.group.id)
  assert.deepEqual(ids(countingGroups(groups, [{ slug: 'a', primary: true }, { slug: 'b', primary: false }])), ['a', 'm'])
  assert.deepEqual(ids(countingGroups([groups[0]!, groups[2]!], [{ slug: 'a', primary: false }])), ['a', 'm'])
  assert.deepEqual(ids(countingGroups(groups, [{ slug: 'a', primary: false }, { slug: 'b', primary: false }])), ['m'])
  assert.deepEqual(ids(countingGroups([g('c', 'c', ['manual', 'portal'])], [{ slug: 'c', primary: false }, { slug: 'd', primary: true }])), ['c'])
})
