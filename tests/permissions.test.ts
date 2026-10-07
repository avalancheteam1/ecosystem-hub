import { test } from 'vitest'
import assert from 'node:assert/strict'
import { PERMISSIONS, can, holdsAny, effectivePermissions, isPermission, PERMISSION_GROUPS, type AuthzUser } from '@/lib/permissions'

const user = (perms: string[] = [], isSuperAdmin = false): AuthzUser => ({
  isSuperAdmin,
  permissions: effectivePermissions([], perms),
})

test('super admin can everything', () => {
  assert.equal(can(user([], true), 'users.view'), true)
})

test('anonymous and permissionless users cannot', () => {
  assert.equal(can(null, 'users.view'), false)
  assert.equal(can(user(), 'users.view'), false)
})

test('role permissions and direct grants both count', () => {
  assert.equal(can({ isSuperAdmin: false, permissions: effectivePermissions([['users.view']], []) }, 'users.view'), true)
  assert.equal(can(user(['users.view']), 'users.view'), true)
})

test('unknown persisted keys are dropped, never granted', () => {
  const perms = effectivePermissions([['ghost.key', 'users.view']], ['also.gone'])
  assert.deepEqual([...perms], ['users.view'])
  assert.equal(isPermission('ghost.key'), false)
})

test('holdsAny gates the admin area', () => {
  assert.equal(holdsAny(null), false)
  assert.equal(holdsAny(user()), false)
  assert.equal(holdsAny(user(['users.view'])), true)
  assert.equal(holdsAny(user([], true)), true)
})

test('registry integrity: requires reference real keys, every key is in a group', () => {
  for (const [key, def] of Object.entries(PERMISSIONS)) {
    for (const r of (def as { requires?: readonly string[] }).requires ?? []) {
      assert.ok(isPermission(r), `${key} requires unknown ${r}`)
    }
  }
  const grouped = PERMISSION_GROUPS.flatMap((g) => g.keys).sort()
  assert.deepEqual(grouped, Object.keys(PERMISSIONS).sort())
})
