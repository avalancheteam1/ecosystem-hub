// Runs once when a Next.js server starts: log env problems (super admins also see them in /admin).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return
  const { warnServerEnv } = await import('@/lib/env')
  warnServerEnv()
}
