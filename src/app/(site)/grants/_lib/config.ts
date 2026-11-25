import 'server-only'

// Deploy compatible readers before enabling short-intake writes.
export function shortIntakeEnabled() {
  return process.env.GRANTS_SHORT_INTAKE_ENABLED === 'true'
}

// This switch selects a workflow for first submissions. Persisted cases retain their version.
export function milestoneFirstEnabled() {
  return process.env.GRANTS_MILESTONE_FIRST_ENABLED === 'true'
}

// An explicit transport and database prevent pg from taking its destination
// from connection parameters, host lookup, or PGHOST/PGPORT/PGDATABASE.
const fixtureDatabaseUrl = /^postgres(?:ql)?:\/\/(?:(?:[a-zA-Z0-9._~!$&'()*+,;=:-]|%[a-fA-F0-9]{2})+@)?(?:127\.0\.0\.1|\[::1\]):[1-9]\d{0,4}\/[a-zA-Z0-9_]{1,58}_test$/

export function syntheticPayoutEnabled(databaseUrl: string | undefined) {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') return false
  if (process.env.GRANTS_SYNTHETIC_PAYOUT_ENABLED !== 'true') return false
  return !!databaseUrl && fixtureDatabaseUrl.test(databaseUrl) && Number(URL.parse(databaseUrl)?.port) > 0
}
