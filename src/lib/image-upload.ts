import { imageSize } from 'image-size'

// Server-side image validation (ported from the member portal). The file's
// claimed type is ignored: type + extension come from the magic bytes, size
// from the image header. Clients crop to the exact aspect before uploading.

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

function sniff(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 6 && buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif'
  return null
}

export type ImageRules = { aspect: number; maxDimension: number; minDimension?: number; maxBytes: number }
export type ValidImage = { ok: true; contentType: string; extension: string; width: number; height: number }

export function validateImageBuffer(buf: Buffer, r: ImageRules): ValidImage | { ok: false; error: string } {
  if (buf.length > r.maxBytes) return { ok: false, error: `Image must be smaller than ${Math.round(r.maxBytes / 100_000) / 10} MB` }
  const contentType = sniff(buf)
  if (!contentType) return { ok: false, error: 'Upload a JPG, PNG, WebP or GIF image' }
  let dims: { width?: number; height?: number }
  try {
    dims = imageSize(buf)
  } catch {
    return { ok: false, error: 'Could not read the image' }
  }
  const { width, height } = dims
  if (!width || !height) return { ok: false, error: 'Could not read the image size' }
  const off = r.aspect === 1 ? width !== height : Math.abs(width / height / r.aspect - 1) > 0.02
  if (off) return { ok: false, error: r.aspect === 1 ? 'Image must be square' : 'Image has the wrong shape - crop it again' }
  if (width > r.maxDimension || height > r.maxDimension) return { ok: false, error: `Image must be at most ${r.maxDimension}px wide` }
  if (r.minDimension && Math.min(width, height) < r.minDimension) return { ok: false, error: `Image must be at least ${r.minDimension}px` }
  return { ok: true, contentType, extension: TYPES[contentType]!, width, height }
}
