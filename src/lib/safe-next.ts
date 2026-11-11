/**
 * Post-sign-in redirect target: only same-origin paths, else /dashboard (no open
 * redirect). Resolved with the URL parser - browsers strip tabs/newlines, so
 * string-prefix checks alone miss tricks like "/\t/evil.io" → "//evil.io". The
 * parsed output is checked too: dot segments collapse, so "/.//evil.io" parses
 * same-origin but its pathname is "//evil.io".
 */
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith('/')) return '/dashboard'
  const base = 'http://hub.invalid'
  const url = new URL(next, base)
  if (url.origin !== base || url.pathname.startsWith('//')) return '/dashboard'
  return url.pathname + url.search + url.hash
}

/** True when `next` is a non-empty value `safeNext` would refuse (for security events). */
export function rejectsNext(next: string | null | undefined): boolean {
  return !!next && safeNext(next) === '/dashboard' && next !== '/dashboard'
}

/** What a refused target pointed at, for logs: its host (or scheme), never the full URL with its path/query. */
export function rejectedTarget(next: string): string {
  try {
    const url = new URL(next.replace(/[\t\n\r]/g, ''), 'http://hub.invalid')
    return (url.host === 'hub.invalid' ? 'path-trick' : url.host || url.protocol).slice(0, 100)
  } catch {
    return 'unparseable'
  }
}
