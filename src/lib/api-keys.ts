import crypto from 'node:crypto'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { getRequestIp } from '@/lib/request-ip'
import type { ApiScope } from '@/lib/api-scopes'

// API keys for /api/v1: `hub_<8 hex prefix>_<32 random bytes base64url>`.
// Shown once at creation; only the sha256 is stored. The key carries 256 bits
// of entropy, so a lookup by hash needs no constant-time compare.

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(): { key: string; prefix: string; keyHash: string } {
  const prefix = crypto.randomBytes(4).toString('hex')
  const key = `hub_${prefix}_${crypto.randomBytes(32).toString('base64url')}`
  return { key, prefix, keyHash: hashApiKey(key) }
}

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** v1 success envelope: `{ success: true, data }`, never cached, no CORS. */
export function v1Json(data: unknown, status = 200): Response {
  return Response.json({ success: true, data }, { status, headers: NO_STORE })
}

export function v1Error(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status, headers: NO_STORE })
}

const LAST_USED_EVERY_MS = 60_000

/**
 * Resolve the request's API key and require `scope`, else a v1 error Response.
 * Read from the DB on every request, so a revoke takes effect immediately.
 *   const key = await requireApiKey(req, 'users:check'); if (key instanceof Response) return key
 */
export async function requireApiKey(request: Request, scope: ApiScope): Promise<{ id: string; name: string } | Response> {
  const byIp = rateLimit(`api-ip:${getRequestIp(request.headers) ?? 'unknown'}`, { limit: 300, windowMs: 60_000 })
  if (!byIp.ok) return v1Error(429, `Too many requests, retry in ${byIp.retryAfterSeconds}s`)

  const raw = request.headers.get('authorization')?.match(/^Bearer (hub_[0-9a-f]{8}_[A-Za-z0-9_-]{43})$/)?.[1]
  if (!raw) return v1Error(401, 'Missing or malformed API key')
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(raw) } })
  if (!key || key.revokedAt) return v1Error(401, 'Invalid API key')
  if (!key.scopes.includes(scope)) return v1Error(403, `This key lacks the ${scope} scope`)

  const byKey = rateLimit(`api-key:${key.id}`, { limit: 120, windowMs: 60_000 })
  if (!byKey.ok) return v1Error(429, `Too many requests, retry in ${byKey.retryAfterSeconds}s`)

  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
  }
  return { id: key.id, name: key.name }
}
