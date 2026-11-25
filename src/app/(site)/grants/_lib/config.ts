import 'server-only'

// Deploy compatible readers before enabling short-intake writes.
export function shortIntakeEnabled() {
  return process.env.GRANTS_SHORT_INTAKE_ENABLED === 'true'
}

// This switch selects a workflow for first submissions. Persisted cases retain their version.
export function milestoneFirstEnabled() {
  return process.env.GRANTS_MILESTONE_FIRST_ENABLED === 'true'
}

export function syntheticPayoutEnabled() {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') return false
  if (process.env.GRANTS_SYNTHETIC_PAYOUT_ENABLED !== 'true') return false
  const database = URL.parse(process.env.DATABASE_URL ?? '')
  return !!database && ['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
}
