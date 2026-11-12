import { beforeEach, test, vi } from 'vitest'
import { logger } from '@/lib/logger'
import assert from 'node:assert/strict'
import { z } from 'zod'

const current = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => current.user }))

const sec = vi.hoisted(() => ({ securityEvent: vi.fn() }))
vi.mock('@/lib/security-events', () => sec)
const mon = vi.hoisted(() => ({ captureError: vi.fn((): string | undefined => 'abcdef1234567890') }))
vi.mock('@/lib/monitoring', () => mon)
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'cf-connecting-ip': '203.0.113.1' }) }))

import { action, ActionError, ForbiddenError, issueMessage } from '@/lib/action'

const member = { id: 'u1', name: 'A', email: 'a@x.io', image: null, isSuperAdmin: false, permissions: new Set() }
const viewer = { ...member, permissions: new Set(['users.view']) }
const superAdmin = { ...member, isSuperAdmin: true }

beforeEach(() => {
  current.user = null
  sec.securityEvent.mockReset()
  mon.captureError.mockClear()
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
  const spy = vi.spyOn(logger, 'error').mockImplementation(() => {})
  const b = await action({ schema, permission: 'users.view' }, async () => { throw new Error('db exploded') })({ n: 1 })
  assert.deepEqual(b, { ok: false, error: 'Something went wrong (ref: abcdef12)' })
  spy.mockRestore()
})

test('an unexpected error is captured and returns a short ref', async () => {
  current.user = viewer
  const spy = vi.spyOn(logger, 'error').mockImplementation(() => {})
  const err = new Error('db exploded')
  const fail = action({ schema, permission: 'users.view' }, async () => { throw err })
  assert.deepEqual(await fail({ n: 1 }), { ok: false, error: 'Something went wrong (ref: abcdef12)' })
  assert.deepEqual(mon.captureError.mock.calls[0], [err, { userId: 'u1' }])
  mon.captureError.mockReturnValueOnce(undefined)
  assert.deepEqual(await fail({ n: 1 }), { ok: false, error: 'Something went wrong' })
  spy.mockRestore()
})

test('ActionError is not captured', async () => {
  current.user = viewer
  await action({ schema, permission: 'users.view' }, async () => { throw new ActionError('Slug taken') })({ n: 1 })
  await action({ schema, permission: 'users.view' }, async () => { throw new ForbiddenError('Not yours') })({ n: 1 })
  assert.equal(mon.captureError.mock.calls.length, 0)
})

test('success passes parsed input and the user to the handler', async () => {
  current.user = viewer
  const res = await action({ schema, permission: 'users.view' }, async (input, user) => `${user.id}:${input.n}`)({ n: 7 })
  assert.deepEqual(res, { ok: true, data: 'u1:7' })
})

test('Zod default messages get the field name; custom messages pass through', () => {
  const s = z.object({ fields: z.object({ techDescription: z.string().max(3), name: z.string().max(3, 'Name: max 3') }) })
  const msg = (input: unknown) => issueMessage(s.safeParse(input).error?.issues[0])
  assert.match(msg({ fields: { techDescription: 'long', name: '' } }), /^Tech description: too big/)
  assert.equal(msg({ fields: { techDescription: '', name: 'long' } }), 'Name: max 3')
  assert.equal(issueMessage(undefined), 'Invalid input')
})

test('a ForbiddenError returns its message and records action.forbidden', async () => {
  current.user = viewer
  const res = await action({ schema, permission: 'users.view' }, async () => { throw new ForbiddenError('Not your hackathon') })({ n: 1 })
  assert.deepEqual(res, { ok: false, error: 'Not your hackathon' })
  assert.deepEqual(sec.securityEvent.mock.calls, [['action.forbidden', { userId: 'u1', ip: '203.0.113.1', detail: { reason: 'Not your hackathon' } }]])
})

test('a registry denial records action.forbidden', async () => {
  current.user = member
  await action({ schema, permission: 'users.view' }, async () => 1)({ n: 1 })
  assert.deepEqual(sec.securityEvent.mock.calls, [['action.forbidden', { userId: 'u1', ip: '203.0.113.1', detail: { permission: 'users.view' } }]])
})

test('a super admin missing a second factor records nothing', async () => {
  current.user = { ...member, superAdminNeedsSecondFactor: true }
  const res = await action({ schema, permission: 'superAdmin' }, async () => 1)({ n: 1 })
  assert.equal(res.ok, false)
  assert.equal(sec.securityEvent.mock.calls.length, 0)
})

test('an anonymous call records action.unauthenticated', async () => {
  await action({ schema, permission: 'user' }, async () => 1)({ n: 1 })
  assert.deepEqual(sec.securityEvent.mock.calls, [['action.unauthenticated', { ip: '203.0.113.1' }]])
})

test('invalid input records action.invalid_input with the field and zod code, never the value', async () => {
  current.user = viewer
  await action({ schema, permission: 'users.view' }, async () => 1)({ n: 'jane@x.io' } as never)
  assert.equal(sec.securityEvent.mock.calls.length, 1)
  const [type, ctx] = sec.securityEvent.mock.calls[0]!
  assert.equal(type, 'action.invalid_input')
  assert.deepEqual(ctx, { userId: viewer.id, ip: '203.0.113.1', detail: { field: 'n', issue: 'invalid_type' } })
  assert.ok(!JSON.stringify(ctx).includes('jane@x.io'))
})
