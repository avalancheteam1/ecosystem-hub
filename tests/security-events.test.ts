import { afterEach, beforeEach, test, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import assert from 'node:assert/strict'

vi.mock('server-only', () => ({}))
const mon = vi.hoisted(() => ({ captureSecurity: vi.fn() }))
vi.mock('@/lib/monitoring', () => mon)
const alertFn = vi.hoisted(() => ({ sendSystemAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/system-alert', () => alertFn)

import { logger } from '@/lib/logger'
import { hashIdentifier, securityEvent } from '@/lib/security-events'

beforeEach(() => {
  vi.restoreAllMocks()
  mon.captureSecurity.mockReset()
  alertFn.sendSystemAlert.mockReset().mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

test('logs the event with hashes, never the plain email or ip', () => {
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  securityEvent('action.forbidden', { userId: 'u1', email: 'Me@X.io', ip: '203.0.113.9', detail: { permission: 'users.view' } })
  const [obj] = warn.mock.calls[0] as unknown as [Record<string, unknown>]
  assert.equal(obj.emailHash, hashIdentifier('me@x.io'))
  assert.equal(obj.ipHash, hashIdentifier('203.0.113.9'))
  assert.equal(obj.permission, 'users.view')
  assert.ok(!JSON.stringify(obj).includes('me@x.io'))
  assert.ok(!JSON.stringify(obj).includes('203.0.113.9'))
})

test('detail cannot overwrite event, userId or the hashes', () => {
  const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  securityEvent('action.forbidden', { userId: 'u1', email: 'a@x.io', ip: '203.0.113.9', detail: { event: 'x', userId: 'evil', emailHash: 'plain@x.io', ipHash: '1.2.3.4', ok: 1 } })
  const [obj] = warn.mock.calls[0] as unknown as [Record<string, unknown>]
  assert.equal(obj.event, 'action.forbidden')
  assert.equal(obj.userId, 'u1')
  assert.equal(obj.emailHash, hashIdentifier('a@x.io'))
  assert.equal(obj.ipHash, hashIdentifier('203.0.113.9'))
  assert.equal(obj.ok, 1)
})

test('hashIdentifier is stable and case/space-insensitive', () => {
  assert.equal(hashIdentifier(' A@B.io '), hashIdentifier('a@b.io'))
  assert.notEqual(hashIdentifier('a@b.io'), hashIdentifier('c@b.io'))
  assert.match(hashIdentifier('a@b.io') ?? '', /^[0-9a-f]{64}$/)
})

test('an alert goes to sendSystemAlert and to GlitchTip as security.alert', () => {
  vi.spyOn(logger, 'warn').mockImplementation(() => {})
  for (let i = 0; i < 10; i++) securityEvent('auth.otp.failed', { email: 'victim-alert@x.io' })
  assert.equal(alertFn.sendSystemAlert.mock.calls.length, 1)
  assert.ok(mon.captureSecurity.mock.calls.some((c) => c[0] === 'security.alert' && c[1] === 'error'))
})

test('a throwing capture never stops the alert', () => {
  vi.spyOn(logger, 'warn').mockImplementation(() => {})
  vi.spyOn(logger, 'error').mockImplementation(() => {})
  mon.captureSecurity.mockImplementation(() => {
    throw new Error('boom')
  })
  assert.doesNotThrow(() => {
    for (let i = 0; i < 10; i++) securityEvent('auth.otp.failed', { email: 'victim-throw@x.io' })
  })
  assert.equal(alertFn.sendSystemAlert.mock.calls.length, 1)
})

test('a rejecting webhook does not throw and capture still runs', async () => {
  vi.spyOn(logger, 'warn').mockImplementation(() => {})
  const err = vi.spyOn(logger, 'error').mockImplementation(() => {})
  alertFn.sendSystemAlert.mockRejectedValue(new Error('down'))
  assert.doesNotThrow(() => {
    for (let i = 0; i < 10; i++) securityEvent('auth.otp.failed', { email: 'victim-hook@x.io' })
  })
  assert.ok(mon.captureSecurity.mock.calls.some((c) => c[0] === 'security.alert'))
  await new Promise((r) => setImmediate(r))
  assert.ok(err.mock.calls.some((c) => c[1] === 'security alert failed'))
})

test('a blank LOG_HASH_SECRET is treated as unset', () => {
  vi.stubEnv('LOG_HASH_SECRET', undefined as unknown as string)
  vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(32))
  const unset = hashIdentifier('a@b.io')
  vi.stubEnv('LOG_HASH_SECRET', '')
  assert.equal(hashIdentifier('a@b.io'), unset)
})

test('hashIdentifier gives no hash in production without a key', () => {
  vi.stubEnv('LOG_HASH_SECRET', '')
  vi.stubEnv('BETTER_AUTH_SECRET', '')
  vi.stubEnv('NODE_ENV', 'production')
  assert.equal(hashIdentifier('a@b.io'), undefined)
})

test('the fallback key is derived from BETTER_AUTH_SECRET, not the secret itself', () => {
  vi.stubEnv('LOG_HASH_SECRET', '')
  vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(32))
  const direct = createHmac('sha256', 'x'.repeat(32)).update('a@b.io').digest('hex')
  assert.match(hashIdentifier('a@b.io') ?? '', /^[0-9a-f]{64}$/)
  assert.notEqual(hashIdentifier('a@b.io'), direct)
})
