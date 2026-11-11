import { beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'

const apiKey = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { apiKey } }))

const sec = vi.hoisted(() => ({ securityEvent: vi.fn() }))
vi.mock('@/lib/security-events', () => sec)

import { generateApiKey, hashApiKey, requireApiKey } from '@/lib/api-keys'

const req = (auth?: string) => new Request('http://x/api/v1/users/check', { method: 'POST', headers: auth ? { authorization: auth } : {} })
const status = async (p: Promise<unknown>) => { const r = await p; return r instanceof Response ? r.status : 'ok' }

const { key, keyHash } = generateApiKey()
const row = { id: 'k1', name: 'cascade', keyHash, scopes: ['users:check'], revokedAt: null, lastUsedAt: new Date() }

beforeEach(() => {
  apiKey.findUnique.mockReset()
  apiKey.update.mockReset().mockResolvedValue({})
  sec.securityEvent.mockReset()
})

test('generated keys have the hub_ format and hash deterministically', () => {
  assert.match(key, /^hub_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/)
  assert.equal(hashApiKey(key), keyHash)
  assert.notEqual(generateApiKey().key, key)
})

test('missing or malformed Authorization → 401 without a DB lookup', async () => {
  assert.equal(await status(requireApiKey(req(), 'users:check')), 401)
  assert.equal(await status(requireApiKey(req('Bearer nope'), 'users:check')), 401)
  assert.equal(await status(requireApiKey(req(`Basic ${key}`), 'users:check')), 401)
  assert.equal(apiKey.findUnique.mock.calls.length, 0)
})

test('unknown and revoked keys → 401', async () => {
  apiKey.findUnique.mockResolvedValueOnce(null)
  assert.equal(await status(requireApiKey(req(`Bearer ${key}`), 'users:check')), 401)
  apiKey.findUnique.mockResolvedValueOnce({ ...row, revokedAt: new Date() })
  assert.equal(await status(requireApiKey(req(`Bearer ${key}`), 'users:check')), 401)
})

test('a key without the scope → 403', async () => {
  apiKey.findUnique.mockResolvedValueOnce({ ...row, scopes: [] })
  assert.equal(await status(requireApiKey(req(`Bearer ${key}`), 'users:check')), 403)
})

test('a valid key resolves to the key and is looked up by hash', async () => {
  apiKey.findUnique.mockResolvedValueOnce(row)
  const res = await requireApiKey(req(`Bearer ${key}`), 'users:check')
  assert.deepEqual(res, { id: 'k1', name: 'cascade' })
  assert.deepEqual(apiKey.findUnique.mock.calls[0]![0], { where: { keyHash } })
})

const last = () => sec.securityEvent.mock.calls.at(-1)

test('a well-formed unknown key records api.key.invalid on a fixed target, prefix in detail', async () => {
  apiKey.findUnique.mockResolvedValueOnce(null)
  assert.equal(await status(requireApiKey(req(`Bearer ${key}`), 'users:check')), 401)
  assert.equal(last()![0], 'api.key.invalid')
  assert.equal(last()![1].target, 'api.key.invalid')
  assert.deepEqual(last()![1].detail, { prefix: key.split('_')[1] })
})

test('a revoked key records api.key.revoked', async () => {
  apiKey.findUnique.mockResolvedValueOnce({ ...row, revokedAt: new Date() })
  assert.equal(await status(requireApiKey(req(`Bearer ${key}`), 'users:check')), 401)
  assert.equal(last()![0], 'api.key.revoked')
  assert.equal(last()![1].target, 'k1')
})

test('a missing scope records api.scope.denied', async () => {
  apiKey.findUnique.mockResolvedValueOnce({ ...row, scopes: [] })
  assert.equal(await status(requireApiKey(req(`Bearer ${key}`), 'users:check')), 403)
  assert.equal(last()![0], 'api.scope.denied')
  assert.deepEqual(last()![1].detail, { scope: 'users:check' })
})

test('a malformed header records api.key.malformed', async () => {
  assert.equal(await status(requireApiKey(req('Bearer nope'), 'users:check')), 401)
  assert.equal(last()![0], 'api.key.malformed')
})
