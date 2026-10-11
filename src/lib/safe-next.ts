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
