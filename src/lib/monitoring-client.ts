// Browser capture for errors React's error boundaries swallow (they never reach window.onerror).
// Errors with a digest came from the server and are already captured there.
export function captureClientError(error: Error & { digest?: string }): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || error.digest) return
  void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error)).catch(() => {})
}
