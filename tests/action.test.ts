import { beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { z } from 'zod'

const current = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => current.user }))

import { action, ActionError } from '@/lib/action'

const member = { id: 'u1', name: 'A', email: 'a@x.io', image: null, isSuperAdmin: false, permissions: new Set() }
const viewer = { ...member, permissions: new Set(['users.view']) }
const superAdmin = { ...member, isSuperAdmin: true }

beforeEach(() => {
  current.user = null
})

const schema = z.object({ n: z.number().int() })

test('anonymous callers are rejected before the handler runs', async () => {
  const handler = vi.fn(async () => 1)
  const res = await action({ schema, permission: 'user' }, handler)({ n: 1 })
  assert.deepEqual(res, { ok: false, error: 'Not signed in' })
  assert.equal(handler.mock.calls.length, 0)
})

test('a signed-in user without the permission gets Forbidden and the handler never runs', async () => {
  current.user = member
  const handler = vi.fn(async () => 1)
  const res = await action({ schema, permission: 'users.view' }, handler)({ n: 1 })
  assert.deepEqual(res, { ok: false, error: 'Forbidden' })
  assert.equal(handler.mock.calls.length, 0)
})

test('superAdmin-only actions reject permission holders', async () => {
  current.user = viewer
  const res = await action({ schema, permission: 'superAdmin' }, async () => 1)({ n: 1 })
  assert.deepEqual(res, { ok: false, error: 'Forbidden' })
  current.user = superAdmin
  assert.deepEqual(await action({ schema, permission: 'superAdmin' }, async () => 1)({ n: 1 }), { ok: true, data: 1 })
})

test('invalid input returns the first validation message', async () => {
  current.user = viewer
  const res = await action({ schema, permission: 'users.view' }, async () => 1)({ n: 1.5 } as never)
  assert.equal(res.ok, false)
})

test('ActionError messages reach the caller; other errors are masked', async () => {
  current.user = viewer
  const a = await action({ schema, permission: 'users.view' }, async () => { throw new ActionError('Slug taken') })({ n: 1 })
  assert.deepEqual(a, { ok: false, error: 'Slug taken' })
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const b = await action({ schema, permission: 'users.view' }, async () => { throw new Error('db exploded') })({ n: 1 })
  assert.deepEqual(b, { ok: false, error: 'Something went wrong' })
  spy.mockRestore()
})

test('success passes parsed input and the user to the handler', async () => {
  current.user = viewer
  const res = await action({ schema, permission: 'users.view' }, async (input, user) => `${user.id}:${input.n}`)({ n: 7 })
  assert.deepEqual(res, { ok: true, data: 'u1:7' })
})
