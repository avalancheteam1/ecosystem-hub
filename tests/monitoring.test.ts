import { beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'

const sentry = vi.hoisted(() => ({ client: undefined as object | undefined, captureException: vi.fn(() => 'abcdef1234567890'), captureMessage: vi.fn() }))
vi.mock('@sentry/node', () => ({ getClient: () => sentry.client, captureException: sentry.captureException, captureMessage: sentry.captureMessage }))

import { captureError, captureSecurity, sentryServerOptions } from '@/lib/monitoring'

beforeEach(() => {
  sentry.client = undefined
  sentry.captureException.mockClear()
  sentry.captureMessage.mockClear()
})

test('without SENTRY_DSN captureError returns undefined and captureSecurity does nothing', () => {
  assert.equal(captureError(new Error('x'), { userId: 'u1' }), undefined)
  captureSecurity('auth.otp.failed', 'warning', { userId: 'u1' })
  assert.equal(sentry.captureException.mock.calls.length + sentry.captureMessage.mock.calls.length, 0)
})

test('with Sentry initialised: event id back, security events fingerprinted and tagged', () => {
  sentry.client = {}
  assert.equal(captureError(new Error('x'), { userId: 'u1' }), 'abcdef1234567890')
  captureSecurity('auth.otp.failed', 'warning', { userId: 'u1', tags: { event: 'auth.otp.failed' }, extra: { n: 1 } })
  assert.deepEqual(sentry.captureMessage.mock.calls[0], ['auth.otp.failed', { level: 'warning', fingerprint: ['auth.otp.failed'], tags: { event: 'auth.otp.failed', security: 'true' }, user: { id: 'u1' }, extra: { n: 1 } }])
})

test('a throwing SDK never reaches the caller', () => {
  sentry.client = {}
  sentry.captureException.mockImplementationOnce(() => { throw new Error('sdk') })
  sentry.captureMessage.mockImplementationOnce(() => { throw new Error('sdk') })
  assert.equal(captureError(new Error('x')), undefined)
  captureSecurity('auth.otp.failed', 'warning', {})
})

test('server options: errors only, no trace headers, no session envelopes', () => {
  vi.stubEnv('SENTRY_DSN', '  ')
  assert.equal(sentryServerOptions(), undefined)
  vi.stubEnv('SENTRY_DSN', 'https://k@glitchtip.example/1')
  const o = sentryServerOptions()!
  vi.unstubAllEnvs()
  assert.equal('tracesSampleRate' in o, false)
  assert.deepEqual(o.tracePropagationTargets, [])
  assert.equal(o.enableOpenTelemetrySetup, false)
  const names = (o.integrations as (d: { name: string }[]) => { name: string }[])([{ name: 'ProcessSession' }, { name: 'Http' }]).map((i) => i.name)
  assert.deepEqual(names, ['Http'])
})
