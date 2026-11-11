import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { rateLimit } from '@/lib/rate-limit'
import { getRequestIp } from '@/lib/request-ip'
import { REF_COOKIE, REF_COOKIE_MAX_AGE, shouldSetRefCookie } from '@/app/(app)/referrals/_lib/rules'

// Next 16's renamed middleware. Three jobs:
//  1. per-request CSP nonce (script-src without 'unsafe-inline'),
//  2. a coarse AUTHENTICATION wall for /dashboard and /admin (cookie presence
//     only). It is NOT authorization - guards in src/lib/guards.ts and
//     action() are authoritative,
//  3. remember ?ref= for sign-up attribution (a cookie, no DB).

const PROTECTED = ['/dashboard', '/admin', '/manage', '/projects', '/judge', '/profile', '/referrals', '/groups']

/** ?ref=<code> on any page → remember it for sign-up (first code wins). */
function withRefCookie(request: NextRequest, res: NextResponse): NextResponse {
  const code = shouldSetRefCookie(request.cookies.get(REF_COOKIE)?.value, request.nextUrl.searchParams.get('ref'))
  if (code) res.cookies.set(REF_COOKIE, code, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: REF_COOKIE_MAX_AGE, path: '/' })
  return res
}

// Image hosts: Luma covers, Google/GitHub avatars, our uploads (same list as next.config.ts
// remotePatterns). Nothing else - so user Markdown can't embed tracking pixels.
const uploadsOrigin = (() => {
  try {
    return process.env.STORAGE_PUBLIC_BASE_URL ? ` ${new URL(process.env.STORAGE_PUBLIC_BASE_URL).origin}` : ''
  } catch {
    return ''
  }
})()
const IMG_SRC = `'self' data: blob: https://images.lumacdn.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com${uploadsOrigin}`

function buildCsp(nonce: string): string {
  const devEval = process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval} https://wal.team1.network https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${IMG_SRC}`,
    "font-src 'self' data:",
    "connect-src 'self' https://wal.team1.network",
    // Cloudflare Turnstile (sign-in captcha) and education videos render in iframes.
    'frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com https://github.com",
    "object-src 'none'",
  ].join('; ')
}

// GlitchTip browser tunnel (next.config.ts tunnelRoute + src/app/sentry-tunnel). A per-IP cap (in memory only,
// never logged) in front of the global one, so a single client can't use up the global cap for everyone.
const TUNNEL_PATHS = ['/monitoring', '/sentry-tunnel']

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  // Next rewrites match case-insensitively (/Monitoring reaches the tunnel too), so compare lowercased.
  if (TUNNEL_PATHS.includes(pathname.toLowerCase())) {
    const byIp = rateLimit(`sentry-tunnel:${getRequestIp(request.headers) ?? 'unknown'}`, { limit: 60, windowMs: 60_000 })
    const limit = byIp.ok ? rateLimit('sentry-tunnel', { limit: 600, windowMs: 60_000 }) : byIp
    return limit.ok ? NextResponse.next() : new NextResponse(null, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })
  }
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  const csp = buildCsp(nonce)

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/')) && !getSessionCookie(request)) {
    const url = new URL('/sign-in', request.url)
    url.searchParams.set('next', pathname + search)
    const res = NextResponse.redirect(url)
    res.headers.set('Content-Security-Policy', csp)
    return withRefCookie(request, res)
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-pathname', pathname + search)
  requestHeaders.set('Content-Security-Policy', csp)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return withRefCookie(request, res)
}

export const config = {
  // Trailing slashes matter: `api` alone would also skip a future page like /api-docs.
  matcher: ['/((?!api/|_next/static/|_next/image|favicon.ico|icon.png|apple-icon.png|logos/|icons/).*)'],
}
