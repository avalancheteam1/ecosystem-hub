import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { sendMail } from '@/lib/mailer'

const mail = { to: 'a@x.io', subject: 'Code', text: 'Your code is 123456' }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

test('without SMTP in development the mail is logged instead of sent', async () => {
  vi.stubEnv('SMTP_HOST', '')
  vi.stubEnv('NODE_ENV', 'development')
  const log = vi.spyOn(console, 'info').mockImplementation(() => {})
  await sendMail(mail)
  assert.ok(log.mock.calls.some((c) => String(c.join(' ')).includes('123456')))
})

test('without SMTP in production sending fails loudly', async () => {
  vi.stubEnv('SMTP_HOST', '')
  vi.stubEnv('NODE_ENV', 'production')
  await assert.rejects(sendMail(mail), /SMTP/)
})
