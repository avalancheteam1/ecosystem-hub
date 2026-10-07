import { test } from 'vitest'
import assert from 'node:assert/strict'
import { assertMaySetSuperAdmin, permissionListSchema, roleSlugSchema } from '@/lib/access'
import { ActionError } from '@/lib/action-error'

test('a super admin cannot remove their own super admin flag', () => {
  assert.throws(() => assertMaySetSuperAdmin('u1', 'u1', false), ActionError)
})

test('demoting someone else or promoting yourself is allowed', () => {
  assert.doesNotThrow(() => assertMaySetSuperAdmin('u1', 'u2', false))
  assert.doesNotThrow(() => assertMaySetSuperAdmin('u1', 'u1', true))
})

test('role slugs are lowercase kebab-case, 2–41 chars', () => {
  for (const ok of ['judge', 'judge-lead', 'r2']) assert.equal(roleSlugSchema.safeParse(ok).success, true, ok)
  for (const bad of ['Judge', '-x', 'a', 'has space', 'x'.repeat(42)]) assert.equal(roleSlugSchema.safeParse(bad).success, false, bad)
})

test('permission lists accept only registry keys and dedupe', () => {
  assert.deepEqual(permissionListSchema.parse(['users.view', 'users.view']), ['users.view'])
  assert.equal(permissionListSchema.safeParse(['users.view', 'ghost.key']).success, false)
})

test('SUPER_ADMIN_EMAILS only counts for a verified email; the DB flag always counts', async () => {
  const { isSuperAdminUser } = await import('@/lib/access')
  const env = 'Root@Team1.network, other@x.io'
  assert.equal(isSuperAdminUser({ isSuperAdmin: false, email: 'root@team1.network', emailVerified: true }, env), true)
  assert.equal(isSuperAdminUser({ isSuperAdmin: false, email: 'root@team1.network', emailVerified: false }, env), false)
  assert.equal(isSuperAdminUser({ isSuperAdmin: true, email: 'a@x.io', emailVerified: false }, env), true)
  assert.equal(isSuperAdminUser({ isSuperAdmin: false, email: 'a@x.io', emailVerified: true }, undefined), false)
})
