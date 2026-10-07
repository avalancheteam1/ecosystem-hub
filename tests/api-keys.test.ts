import { beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'

const apiKey = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { apiKey } }))

import { generateApiKey, hashApiKey, requireApiKey } from '@/lib/api-keys'

const req = (auth?: string) => new Request('http://x/api/v1/users/check', { method: 'POST', headers: auth ? { authorization: auth } : {} })
const status = async (p: Promise<unknown>) => { const r = await p; return r instanceof Response ? r.status : 'ok' }

const { key, keyHash } = generateApiKey()
const row = { id: 'k1', name: 'cascade', keyHash, scopes: ['users:check'], revokedAt: null, lastUsedAt: new Date() }

beforeEach(() => {
  apiKey.findUnique.mockReset()
  apiKey.update.mockReset().mockResolvedValue({})
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
