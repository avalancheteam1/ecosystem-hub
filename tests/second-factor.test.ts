import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { APIError } from 'better-auth/api'
import { allowedWhilePending, codeAttemptAllowed, endpointSucceeded, MAX_FAILED_CODES, secondFactorPending, superAdminActive } from '@/lib/second-factor'

// better-call's base APIError (validation errors use it) - not a direct dependency, so resolve it
// the way Better Auth does.
const fromBetterAuth = createRequire(createRequire(import.meta.url).resolve('better-auth'))
const { APIError: BaseAPIError } = (await import(fromBetterAuth.resolve('better-call/error'))) as { APIError: new (status: string, body?: object) => Error }

test('endpointSucceeded: only a real response counts, every error class fails', () => {
  assert.equal(endpointSucceeded({ token: 't', user: {} }), true)
  assert.equal(endpointSucceeded({ status: true }), true)
  assert.equal(endpointSucceeded(new APIError('UNAUTHORIZED', { message: 'Invalid code' })), false)
  const validation = new BaseAPIError('BAD_REQUEST', { message: 'Invalid body', code: 'VALIDATION_ERROR' })
  assert.equal(validation instanceof APIError, false) // the trap: not Better Auth's subclass
  assert.equal(endpointSucceeded(validation), false)
  assert.equal(endpointSucceeded(new Error('boom')), false)
  assert.equal(endpointSucceeded(undefined), false)
  assert.equal(endpointSucceeded(null), false)
})

const none = { twoFactorEnabled: false, passkeys: 0 }
const totp = { twoFactorEnabled: true, passkeys: 0 }
const passkey = { twoFactorEnabled: false, passkeys: 1 }
const at = new Date('2026-11-03T12:00:00Z')

test('pending only when a factor exists and this session has not proven it', () => {
  assert.equal(secondFactorPending(none, null), false)
  assert.equal(secondFactorPending(totp, null), true)
  assert.equal(secondFactorPending(passkey, null), true)
  assert.equal(secondFactorPending(totp, at), false)
})

test('super admin powers need a factor proven by this session', () => {
  assert.equal(superAdminActive(true, none, null), false) // no factor set up yet
  assert.equal(superAdminActive(true, none, at), false) // factor removed after proving it
  assert.equal(superAdminActive(true, totp, null), false)
  assert.equal(superAdminActive(true, passkey, at), true)
  assert.equal(superAdminActive(false, totp, at), false)
})

test('a pending session may only verify or sign out', () => {
  for (const p of ['/two-factor/verify-totp', '/two-factor/verify-backup-code', '/passkey/verify-authentication', '/sign-out', '/get-session']) assert.equal(allowedWhilePending(p), true, p)
  for (const p of ['/two-factor/disable', '/two-factor/enable', '/passkey/delete-passkey', '/passkey/verify-registration', '/email-otp/request-email-change', '/email-otp/change-email', '/link-social', '/revoke-sessions'])
    assert.equal(allowedWhilePending(p), false, p)
})

test('code attempts: the first MAX are checked, the next one locks', () => {
  assert.equal(codeAttemptAllowed(1), true)
  assert.equal(codeAttemptAllowed(MAX_FAILED_CODES), true)
  assert.equal(codeAttemptAllowed(MAX_FAILED_CODES + 1), false)
})
