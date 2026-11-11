import { createSentryTunnelRoute } from '@sentry/nextjs/tunnel'

// Browser GlitchTip events arrive here (via the /monitoring rewrite from withSentryConfig's
// tunnelRoute). Only envelopes for our own browser DSN are forwarded (403 otherwise), so this is
// no open proxy. Per-IP and global request caps in src/proxy.ts, size cap below.
// The SDK forwarder sends user-agent, sec-ch-ua*, origin, referer and the client IP (as
// X-Sentry-Forwarded-For). We drop the IP headers (no plain IPs in GlitchTip) and referer
// (may carry a sign-in query string) before forwarding. Cookies are never forwarded.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
const DROP = ['cf-connecting-ip', 'x-vercel-forwarded-for', 'x-forwarded-for', 'x-real-ip', 'referer']

// Error envelopes are far smaller; the SDK forwarder itself has no size limit (it answers 411 without a length).
const MAX_BYTES = 512 * 1024

const forward = dsn ? createSentryTunnelRoute({ allowedDsns: [dsn] }).POST : undefined

export async function POST(request: Request): Promise<Response> {
  if (!forward) return new Response(null, { status: 404 })
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return new Response(null, { status: 413 })
  let rebuilt: Request
  try {
    const headers = new Headers(request.headers)
    for (const h of DROP) headers.delete(h)
    rebuilt = new Request(request.url, { method: 'POST', headers, body: request.body, duplex: 'half' } as RequestInit)
  } catch {
    return new Response(null, { status: 400 })
  }
  return forward(rebuilt)
}
