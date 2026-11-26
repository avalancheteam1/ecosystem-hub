import { beforeEach, describe, expect, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { validateImageBuffer } from '@/lib/image-upload'
import { IMAGE_KINDS } from '@/lib/image-kinds'
import { isOwnUploadKey } from '@/lib/storage/keys'

const upload = vi.hoisted(() => ({ user: null as unknown, put: vi.fn(), audit: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => upload.user }))
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))
vi.mock('@/lib/monitoring', () => ({ captureError: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create: upload.audit } } }))
vi.mock('@/lib/storage', async (original) => ({
  ...await original<typeof import('@/lib/storage')>(),
  getStorage: () => ({ put: upload.put, publicUrl: (key: string) => `https://uploads.example.test/${key}` }),
}))

import { uploadImage } from '@/lib/upload-actions'

// Minimal valid PNG of the given size (IHDR + empty IDAT + IEND) - enough for sniffing + image-size.
function png(w: number, h: number) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(0))), chunk('IEND', Buffer.alloc(0))])
}

test('accepts a square png and derives type from bytes', () => {
  const r = validateImageBuffer(png(400, 400), { aspect: 1, maxDimension: 1000, maxBytes: 1_000_000 })
  assert.deepEqual(r.ok && [r.contentType, r.extension, r.width], ['image/png', 'png', 400])
})

test('rejects non-images regardless of claimed type', () => {
  const r = validateImageBuffer(Buffer.from('<svg onload=alert(1)></svg>'), { aspect: 1, maxDimension: 1000, maxBytes: 1_000_000 })
  assert.equal(r.ok, false)
})

test('enforces aspect (2% slack for non-square), max/min dimension and bytes', () => {
  assert.equal(validateImageBuffer(png(400, 300), { aspect: 1, maxDimension: 1000, maxBytes: 1e6 }).ok, false)
  assert.equal(validateImageBuffer(png(1600, 900), { aspect: 16 / 9, maxDimension: 1600, maxBytes: 1e6 }).ok, true)
  assert.equal(validateImageBuffer(png(1600, 1000), { aspect: 16 / 9, maxDimension: 1600, maxBytes: 1e6 }).ok, false)
  assert.equal(validateImageBuffer(png(2000, 2000), { aspect: 1, maxDimension: 1000, maxBytes: 1e6 }).ok, false)
  assert.equal(validateImageBuffer(png(100, 100), { aspect: 1, maxDimension: 1000, minDimension: 200, maxBytes: 1e6 }).ok, false)
  assert.equal(validateImageBuffer(png(400, 400), { aspect: 1, maxDimension: 1000, maxBytes: 10 }).ok, false)
})

describe('US-11 Earn logo upload', () => {
  const owner = '83a2f90c-8226-400c-8df0-19fe4827db49'
  const otherBounty = '17f149fa-6932-4c27-85f5-096379ba4db6'
  const publisher = { id: 'synthetic-publisher', isSuperAdmin: false, permissions: new Set(['earn.publish']) }

  function logoForm(width: number, height: number, ownerId = owner) {
    const form = new FormData()
    form.set('kind', 'earn-logo')
    form.set('ownerId', ownerId)
    form.set('file', new File([new Uint8Array(png(width, height))], 'synthetic.png', { type: 'image/png' }))
    return form
  }

  beforeEach(() => {
    vi.resetAllMocks()
    upload.user = publisher
  })

  test('registers an independent square logo kind in shared image rules', () => {
    const rules = Object.entries(IMAGE_KINDS).find(([kind]) => kind === 'earn-logo')?.[1]
    expect(rules).toMatchObject({ aspect: 1 })
    expect(rules?.category).not.toBe(IMAGE_KINDS['sponsor-logo'].category)
  })

  test('stores a publisher upload under the preallocated bounty owner and Earn category', async () => {
    const result = await uploadImage(logoForm(400, 400))
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    const category = Object.entries(IMAGE_KINDS).find(([kind]) => kind === 'earn-logo')![1].category
    const { key } = upload.put.mock.calls[0][0]
    expect(result.data.url).toBe(`https://uploads.example.test/${key}`)
    expect(isOwnUploadKey(key, category, owner)).toBe(true)
    expect(isOwnUploadKey(key, category, otherBounty)).toBe(false)
    expect(isOwnUploadKey(key, IMAGE_KINDS['sponsor-logo'].category, owner)).toBe(false)
    expect(upload.audit).toHaveBeenCalledOnce()
  })

  test('denies an ordinary user before writing logo bytes or audit', async () => {
    upload.user = { ...publisher, permissions: new Set() }
    expect(await uploadImage(logoForm(400, 400))).toMatchObject({ ok: false, error: expect.stringMatching(/permission|forbidden/i) })
    expect(upload.put).not.toHaveBeenCalled()
    expect(upload.audit).not.toHaveBeenCalled()
  })

  test('rejects a non-square publisher upload before writing bytes or audit', async () => {
    expect(await uploadImage(logoForm(400, 300))).toMatchObject({ ok: false, error: expect.stringMatching(/square|aspect|ratio/i) })
    expect(upload.put).not.toHaveBeenCalled()
    expect(upload.audit).not.toHaveBeenCalled()
  })
})
