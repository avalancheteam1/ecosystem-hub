import type { Instrumentation } from 'next'

// Runs once when a Next.js server starts: log env problems (super admins also see them in /admin),
// then start GlitchTip (Sentry SDK) when SENTRY_DSN is set.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return
  const { warnServerEnv } = await import('@/lib/env')
  warnServerEnv()
  const { sentryServerOptions } = await import('@/lib/monitoring')
  const options = sentryServerOptions()
  if (options) (await import('@sentry/nextjs')).init({ ...options, enableRuntimeChannelInjection: false })
}

// Server errors (rendering, route handlers, actions that throw past action()) go to GlitchTip.
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.SENTRY_DSN?.trim()) return
  const { captureRequestError } = await import('@sentry/nextjs')
  captureRequestError(...args)
}
