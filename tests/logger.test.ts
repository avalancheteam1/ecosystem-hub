import { test, vi } from 'vitest'
import assert from 'node:assert/strict'

import { createLogger } from '@/lib/logger'

function capture() {
  const lines: string[] = []
  return { lines, stream: { write: (s: string) => void lines.push(s) } }
}

test('redacts secrets and emails at top level and one level deep', () => {
  const { lines, stream } = capture()
  createLogger(stream).warn({ email: 'a@x.io', otp: '123456', detail: { token: 't', email: 'b@x.io' } }, 'x')
  const out = JSON.parse(lines[0])
  assert.equal(out.email, '[redacted]')
  assert.equal(out.otp, '[redacted]')
  assert.equal(out.detail.token, '[redacted]')
  assert.equal(out.detail.email, '[redacted]')
  assert.ok(!lines[0].includes('a@x.io'))
})

test('redacts hyphenated keys and keeps err.code', () => {
  const { lines, stream } = capture()
  const log = createLogger(stream)
  log.info({ 'set-cookie': 'sid=1' }, 'x')
  log.error({ err: Object.assign(new Error('x'), { code: 'P2002' }) }, 'x')
  assert.equal(JSON.parse(lines[0])['set-cookie'], '[redacted]')
  assert.equal(JSON.parse(lines[1]).err.code, 'P2002')
})

test('masks emails and tokens inside logged errors, including nested props and causes', () => {
  const { lines, stream } = capture()
  const smtp = Object.assign(new Error('Message failed: 550 5.1.1 <jane@gmail.com>: Recipient address rejected'), {
    code: 'EENVELOPE',
    response: '550 5.1.1 <jane@gmail.com>: Recipient address rejected',
    rejected: ['jane@gmail.com'],
    cause: new Error('rcpt bob@x.io; link https://hub/projects/invite/tok123\nnext line'),
  })
  createLogger(stream).error({ err: smtp }, 'mail failed')
  assert.ok(!lines[0].includes('jane@gmail.com'), lines[0])
  assert.ok(!lines[0].includes('bob@x.io'), lines[0])
  assert.ok(!lines[0].includes('tok123'), lines[0])
  const out = JSON.parse(lines[0])
  assert.equal(out.err.code, 'EENVELOPE')
  assert.deepEqual(out.err.rejected, ['[email]'])
  assert.match(out.err.stack, /Recipient address rejected/)
})

test('shortens Prisma errors in logs, stack included', () => {
  const { lines, stream } = capture()
  const err = new Error('\nInvalid `prisma.user.create()` invocation:\n\n  data: { name: "Jane Doe", email: "jane@x.io" }\n\nUnknown argument `nme`.')
  err.name = 'PrismaClientValidationError'
  createLogger(stream).error({ err }, 'x')
  assert.ok(!lines[0].includes('Jane Doe'), lines[0])
  const out = JSON.parse(lines[0])
  assert.equal(out.err.message, 'Unknown argument `nme`.')
  assert.match(out.err.stack, /^PrismaClientValidationError: Unknown argument `nme`\./)
})

test('carries service and release', () => {
  vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', 'abc')
  const { lines, stream } = capture()
  createLogger(stream).info('x')
  const out = JSON.parse(lines[0])
  assert.equal(out.service, 'worker')
  assert.equal(out.release, 'abc')
  vi.unstubAllEnvs()
})

test('redacts two levels deep and masks emails in the message', () => {
  const { lines, stream } = capture()
  createLogger(stream).info({ data: { user: { email: 'deep@x.io', name: 'n' } } }, 'sent to msg@x.io (%s)', 'arg@x.io')
  const out = JSON.parse(lines[0])
  assert.equal(out.data.user.email, '[redacted]')
  assert.equal(out.data.user.name, 'n')
  assert.equal(out.msg, 'sent to [email] ([email])')
})
