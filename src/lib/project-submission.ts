// Shared project submission rules, used by hackathons and grants. Pure.

/** builders-hub's "complete submission" set (minus tracks, chosen at submit time) + project stage; a website stands in for a demo link. */
export function missingForSubmission(v: {
  maturity: string | null
  fullDescription: string
  techDescription: string
  techStack: string[]
  githubRepos: string[]
  demoLinks: string[]
  websiteUrl: string | null
}): string[] {
  const missing: string[] = []
  if (!v.maturity) missing.push('Project stage')
  if (!v.fullDescription.trim()) missing.push('Full description')
  if (!v.techDescription.trim()) missing.push('How it’s made')
  if (!v.techStack.length) missing.push('Tech stack')
  if (!v.githubRepos.length) missing.push('Code repository')
  if (!v.demoLinks.length && !v.websiteUrl) missing.push('Website or demo link') // either gives judges something to open
  return missing
}

type VersionState = { sealedAt: Date | null }

/** On submit: seal the draft - or, if the latest version is already sealed (no edits since), reuse it. */
export function planSeal(current: VersionState): 'seal-draft' | 'reuse-sealed' {
  return current.sealedAt ? 'reuse-sealed' : 'seal-draft'
}

/** Existing project roles allowed to edit and submit, shared across submission areas. */
export const TEAM_ROLES: string[] = ['owner', 'writer']
export const canEditProject = (role: string) => TEAM_ROLES.includes(role)
