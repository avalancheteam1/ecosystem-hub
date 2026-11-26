import { test } from 'vitest'
import assert from 'node:assert/strict'
import { activityHref } from '@/app/(app)/projects/_lib/rules'
import { hackathonTargetName, PROJECT_ACTIVITY_EVENTS, PROJECT_PROGRAMS, teamActivityView } from '@/lib/project-activity'

const row = (extra: Partial<Parameters<typeof teamActivityView>[0]> = {}) => ({ program: 'tooling', event: 'submitted', actorId: 'u1', reason: null, reasonInternal: false, ...extra })
const names = new Map([['u1', 'Ada']])

test('teamActivityView: team members by name, staff anonymous, replaced by no one', () => {
  assert.deepEqual(teamActivityView(row(), names), { event: 'Submitted', program: 'Developer Tooling', by: 'Ada', reason: null })
  assert.equal(teamActivityView(row({ actorId: 'gone' }), names).by, 'a former member')
  assert.equal(teamActivityView(row({ event: 'approved', actorId: 'reviewer' }), names).by, 'team1')
  assert.equal(teamActivityView(row({ program: 'hackathon', event: 'advanced', actorId: 'organiser' }), names).by, 'the organisers')
  assert.equal(teamActivityView(row({ event: 'replaced' }), names).by, null)
})

test('teamActivityView: an internal reason never reaches the team', () => {
  assert.equal(teamActivityView(row({ event: 'rejected', reason: 'Needs docs' }), names).reason, 'Needs docs')
  assert.equal(teamActivityView(row({ event: 'rejected', reason: 'Looks like a rug', reasonInternal: true }), names).reason, null)
})

test('teamActivityView: unknown keys fall back to the raw value', () => {
  assert.deepEqual(teamActivityView(row({ program: 'grant', event: 'funded', actorId: null }), names), { event: 'funded', program: 'grant', by: null, reason: null })
  assert.equal(teamActivityView(row({ event: 'toString' }), names).event, 'toString') // no prototype keys
})

test('hackathonTargetName: the stage only when there are several', () => {
  assert.equal(hackathonTargetName('ETH Denver', 'Final', 1), 'ETH Denver')
  assert.equal(hackathonTargetName('ETH Denver', 'Final', 2), 'ETH Denver · Final')
})

test('activityHref: hackathon event page; tooling tool page only for the listed version', () => {
  const c = { projectSlug: 'kit', listedToolingVersionId: 'v4', hackathonSlugs: new Map([['h1', 'eth-denver']]) }
  assert.equal(activityHref({ program: 'hackathon', targetId: 'h1', versionId: 'v3' }, c), '/events/eth-denver')
  assert.equal(activityHref({ program: 'hackathon', targetId: 'gone', versionId: 'v3' }, c), null)
  assert.equal(activityHref({ program: 'tooling', targetId: 'l1', versionId: 'v4' }, c), '/tooling/kit')
  assert.equal(activityHref({ program: 'tooling', targetId: 'l1', versionId: 'v5' }, c), '/tooling/submit')
  assert.equal(activityHref({ program: 'grants', targetId: 'g1', versionId: 'v5' }, c), '/grants/applications/g1')
  assert.equal(activityHref({ program: 'grant', targetId: 'g1', versionId: 'v5' }, c), null)
})

test('registries: persisted keys stay', () => {
  for (const k of ['hackathon', 'tooling']) assert.ok(k in PROJECT_PROGRAMS)
  for (const k of ['submitted', 'approved', 'replaced', 'rejected', 'removed', 'withdrawn', 'unlisted', 'advanced', 'unadvanced', 'disqualified', 'reinstated']) assert.ok(k in PROJECT_ACTIVITY_EVENTS)
})
