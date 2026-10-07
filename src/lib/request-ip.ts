/**
 * Client IP for audit/rate limiting. Production runs visitor → Cloudflare →
 * Railway → app and the origin must be reachable only through Cloudflare, so
 * cf-connecting-ip is trustworthy. x-forwarded-for's rightmost hop is only the
 * fallback for local dev (leftmost entries are client-supplied).
 */
export function getRequestIp(h: Headers): string | null {
  const cf = h.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  const parts = (h.get('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0) return parts[parts.length - 1]!
  return h.get('x-real-ip') || null
}
