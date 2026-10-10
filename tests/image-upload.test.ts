import { test } from 'vitest'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { validateImageBuffer } from '@/lib/image-upload'

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
