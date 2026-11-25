import 'server-only'

// Deploy compatible readers before enabling short-intake writes.
export function shortIntakeEnabled() {
  return process.env.GRANTS_SHORT_INTAKE_ENABLED === 'true'
}

// This switch selects a workflow for first submissions. Persisted cases retain their version.
export function milestoneFirstEnabled() {
  return process.env.GRANTS_MILESTONE_FIRST_ENABLED === 'true'
}
