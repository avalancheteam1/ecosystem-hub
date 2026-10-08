import { test } from 'vitest'
import assert from 'node:assert/strict'
import { startSteps } from '@/app/(app)/dashboard/_lib/start'

const ids = (roles: string[]) => startSteps(roles).map((s) => s.id)

test('startSteps: tailored to the roles', () => {
  assert.deepEqual(ids(['developer']), ['events', 'project', 'learn', 'invite'])
  assert.deepEqual(ids(['founder']), ['events', 'project', 'grants', 'team1'])
  assert.deepEqual(ids(['employee']), ['events', 'grants', 'team1', 'invite'])
  assert.deepEqual(ids(['enthusiast']), ['events', 'learn', 'team1', 'invite'])
})

test('startSteps: events first, at most four', () => {
  assert.deepEqual(ids([]), ['events', 'invite'])
  assert.equal(ids(['developer', 'founder', 'employee']).length, 4)
})
