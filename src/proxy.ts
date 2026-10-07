import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

// Next 16's renamed middleware. Two jobs:
//  1. per-request CSP nonce (script-src without 'unsafe-inline'),
//  2. a coarse AUTHENTICATION wall for /dashboard and /admin (cookie presence
//     only). It is NOT authorization — guards in src/lib/guards.ts and
//     action() are authoritative.

const PROTECTED = ['/dashboard', '/admin']

function buildCsp(nonce: string): string {
  const devEval = process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval} https://wal.team1.network`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://wal.team1.network",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com https://github.com",
    "object-src 'none'",
  ].join('; ')
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  const csp = buildCsp(nonce)

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/')) && !getSessionCookie(request)) {
    const url = new URL('/sign-in', request.url)
    url.searchParams.set('next', pathname + search)
    const res = NextResponse.redirect(url)
    res.headers.set('Content-Security-Policy', csp)
    return res
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-pathname', pathname + search)
  requestHeaders.set('Content-Security-Policy', csp)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  // Trailing slashes matter: `api` alone would also skip a future page like /api-docs.
  matcher: ['/((?!api/|_next/static/|_next/image|favicon.ico|icon.png|apple-icon.png|logos/|icons/).*)'],
}
