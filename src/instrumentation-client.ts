import { DATA_COLLECTION, scrubEvent } from '@/lib/sentry-scrub'

// Browser GlitchTip (Sentry SDK), errors only. NEXT_PUBLIC_SENTRY_DSN is inlined at build:
// unset = the SDK is never loaded. Events go through the same-origin tunnel (/monitoring,
// next.config.ts), so the CSP keeps connect-src 'self'.
// ponytail: loaded async to keep it out of the main bundle; an error in the first moments before init is missed.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
if (dsn) {
  void import('@sentry/nextjs')
    .then((Sentry) =>
      Sentry.init({
        dsn,
        // Explicit, not left to build-time injection: must match next.config.ts tunnelRoute and src/proxy.ts.
        tunnel: '/monitoring',
        tracePropagationTargets: [],
        dataCollection: DATA_COLLECTION,
        beforeSend: scrubEvent,
        // Errors only: no tracing (it would add trace headers to our fetches) and no session envelope
        // per page load (they would compete with real errors for the tunnel cap).
        integrations: (defaults) => defaults.filter((i) => i.name !== 'BrowserTracing' && i.name !== 'BrowserSession'),
      }),
    )
    .catch(() => {})
}
