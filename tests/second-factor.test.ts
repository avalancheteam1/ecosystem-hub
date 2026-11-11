import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { APIError } from 'better-auth/api'
import { allowedWhilePending, codeAttemptAllowed, endpointSucceeded, MAX_FAILED_CODES, otpCheckedEmail, otpCheckFailed, PASSKEY_NAME_MAX, passkeyNameAllowed, secondFactorPending, superAdminActive } from '@/lib/second-factor'

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

test('passkey names: optional, not blank, capped', () => {
  assert.equal(passkeyNameAllowed(undefined), true) // adding without a name keeps the auto name
  assert.equal(passkeyNameAllowed('Work laptop'), true)
  assert.equal(passkeyNameAllowed('x'.repeat(PASSKEY_NAME_MAX)), true)
  assert.equal(passkeyNameAllowed('x'.repeat(PASSKEY_NAME_MAX + 1)), false)
  assert.equal(passkeyNameAllowed('   '), false)
  assert.equal(passkeyNameAllowed(42), false)
})

test('otpCheckedEmail: the address whose code each emailOTP route checks', () => {
  assert.equal(otpCheckedEmail('/sign-in/email-otp', { email: ' A@B.io ', otp: '1' }, undefined), 'a@b.io')
  assert.equal(otpCheckedEmail('/email-otp/verify-email', { email: 'a@b.io' }, undefined), 'a@b.io')
  assert.equal(otpCheckedEmail('/email-otp/check-verification-otp', { email: 'a@b.io' }, undefined), 'a@b.io')
  assert.equal(otpCheckedEmail('/email-otp/change-email', { newEmail: 'New@b.io', otp: '1' }, 'old@b.io'), 'new@b.io')
  assert.equal(otpCheckedEmail('/email-otp/request-email-change', { newEmail: 'new@b.io', otp: '1' }, 'Old@b.io'), 'old@b.io')
  assert.equal(otpCheckedEmail('/email-otp/request-email-change', { newEmail: 'new@b.io' }, 'old@b.io'), undefined) // no code checked
  assert.equal(otpCheckedEmail('/email-otp/send-verification-otp', { email: 'a@b.io' }, undefined), undefined)
  assert.equal(otpCheckedEmail('/sign-in/email-otp', { email: 42 }, undefined), undefined)
  assert.equal(otpCheckedEmail('/sign-in/email-otp', undefined, undefined), undefined)
})

test('otpCheckFailed: only the emailOTP code-check errors count', () => {
  assert.equal(otpCheckFailed(new APIError('BAD_REQUEST', { message: 'Invalid OTP', code: 'INVALID_OTP' })), true)
  assert.equal(otpCheckFailed(new APIError('BAD_REQUEST', { message: 'OTP expired', code: 'OTP_EXPIRED' })), true)
  assert.equal(otpCheckFailed(new APIError('FORBIDDEN', { message: 'Too many attempts', code: 'TOO_MANY_ATTEMPTS' })), true)
  assert.equal(otpCheckFailed(new BaseAPIError('BAD_REQUEST', { message: 'Invalid body', code: 'VALIDATION_ERROR' })), false)
  assert.equal(otpCheckFailed(new APIError('BAD_REQUEST', { message: 'Email is the same' })), false)
  assert.equal(otpCheckFailed(new APIError('UNAUTHORIZED')), false)
  assert.equal(otpCheckFailed(new Error('boom')), false)
  assert.equal(otpCheckFailed({ token: 't' }), false)
  assert.equal(otpCheckFailed(undefined), false)
})
