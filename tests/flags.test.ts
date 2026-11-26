import { test } from 'vitest'
import assert from 'node:assert/strict'
import { FLAGS, flagForPath, flagOn, isFlag } from '@/lib/flags'

test('flagOn: no row = the default; a stored value wins', () => {
  assert.equal(flagOn(new Map(), 'tooling'), FLAGS.tooling.default)
  assert.equal(flagOn(new Map([['tooling', true]]), 'tooling'), true)
  assert.equal(flagOn(new Map([['tooling', false]]), 'tooling'), false)
})

test('flagForPath: the prefix and everything below it, case-insensitive; nothing else', () => {
  for (const p of ['/tooling', '/tooling/', '/tooling/x', '/tooling/submit', '/Tooling/X']) assert.equal(flagForPath(p), 'tooling', p)
  for (const p of ['/', '/toolingx', '/admin/tooling', '/admin/tooling/abc', '/events']) assert.equal(flagForPath(p), null, p)
})

test('isFlag: only registry keys, not prototype names', () => {
  assert.equal(isFlag('tooling'), true)
  assert.equal(isFlag('nope'), false)
  assert.equal(isFlag('toString'), false)
})

test('US-1: continuous Mini Grants defaults off independently of the public Grants flag', () => {
  assert.equal(flagOn(new Map(), 'miniGrantsIntake'), false)
  assert.equal(flagOn(new Map([['miniGrantsIntake', true]]), 'miniGrantsIntake'), true)
  assert.equal(flagForPath('/grants/applications/a'), 'grants')
})

test('US-F3: Grants is opt-in with separate rollout controls and no admin proxy routing', () => {
  assert.equal(flagForPath('/grants'), 'grants')
  assert.equal(flagForPath('/admin/grants'), null)
  assert.equal(flagForPath('/grants-other'), null)
  for (const key of ['grants', 'acceleratorGrants', 'grantsRoundManagement', 'grantsCommitteeReview', 'grantsCommitteeInvitations', 'miniGrantsIntake', 'miniGrantsReapplication'] as const) {
    assert.equal(flagOn(new Map(), key), false)
    assert.equal(flagOn(new Map([[key, true]]), key), true)
  }
})
