import { test } from 'vitest'
import assert from 'node:assert/strict'
import { envProblems } from '@/lib/env'

const base = { DATABASE_URL: 'postgresql://hub:hub@localhost:5433/hub' }

test('a minimal dev env is fine; blanks count as unset', () => {
  assert.deepEqual(envProblems({ ...base, NODE_ENV: 'development', SMTP_HOST: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }), [])
})

test('bad values and half-set providers are reported', () => {
  const p = envProblems({ ...base, DATABASE_URL: 'nope', SMTP_PORT: 'abc', GITHUB_CLIENT_ID: 'x' })
  assert.ok(p.some((l) => l.startsWith('DATABASE_URL')))
  assert.ok(p.some((l) => l.startsWith('SMTP_PORT')))
  assert.ok(p.includes('GITHUB_CLIENT_SECRET: required when GITHUB_CLIENT_ID is set'))
})

test('a bucket switches to s3, which then needs all its keys', () => {
  const p = envProblems({ ...base, STORAGE_S3_BUCKET: 'team1-hub' })
  assert.ok(p.includes('STORAGE_S3_ACCESS_KEY_ID: required'))
})

test('production needs the auth secret, SMTP and Turnstile', () => {
  assert.deepEqual(envProblems({ ...base, NODE_ENV: 'production' }), ['BETTER_AUTH_SECRET: required', 'SMTP_HOST: required', 'TURNSTILE_SITE_KEY: required', 'TURNSTILE_SECRET_KEY: required', 'LOG_HASH_SECRET: required'])
  assert.deepEqual(envProblems({ ...base, NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32), SMTP_HOST: 'smtp.example.com', TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k', LOG_HASH_SECRET: 'h'.repeat(16) }), [])
})

test('production without LOG_HASH_SECRET reports it', () => {
  const p = envProblems({ ...base, NODE_ENV: 'production', BETTER_AUTH_SECRET: 'x'.repeat(32), SMTP_HOST: 'h', TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k' })
  assert.deepEqual(p, ['LOG_HASH_SECRET: required'])
})
