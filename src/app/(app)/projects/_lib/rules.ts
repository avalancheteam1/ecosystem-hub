import type { ProjectFields } from './schemas'

// Project fields - builders-hub's submission fields (battle-tested), stored as
// real arrays instead of comma-joined strings. Pure. A save creates a new
// immutable ProjectVersion unless nothing changed (versionChanged).

export const PROJECT_CATEGORIES = ['Consumer', 'DeFi', 'Enterprise', 'Developer Tooling', 'RWA', 'Gaming', 'Social', 'Other (Specify)'] as const
export const TECH_STACK_DEFAULTS = ['Solidity', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Rust', 'Go', 'Python', 'PostgreSQL', 'Foundry', 'Hardhat', 'wagmi', 'viem', 'Avalanche L1', 'Docker', 'x402', 'Account Abstraction']

const KEYS = ['name', 'shortDescription', 'fullDescription', 'techDescription', 'techStack', 'categories', 'otherCategory', 'maturity', 'launchDate', 'country', 'githubRepos', 'demoLinks', 'videoUrl', 'logoUrl', 'coverUrl', 'screenshots', 'deployedAddresses', 'websiteUrl', 'websites', 'socials'] as const

/** Does saving `next` on top of `prev` warrant a new version? */
export function versionChanged(prev: ProjectFields | null, next: ProjectFields): boolean {
  if (!prev) return true
  return KEYS.some((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null))
}

/** builders-hub's "complete submission" set (minus tracks, chosen at submit time) + project stage; a website stands in for a demo link. */
export function missingForSubmission(v: { maturity: string | null; fullDescription: string; techDescription: string; techStack: string[]; githubRepos: string[]; demoLinks: string[]; websiteUrl: string | null }): string[] {
  const missing: string[] = []
  if (!v.maturity) missing.push('Project stage')
  if (!v.fullDescription.trim()) missing.push('Full description')
  if (!v.techDescription.trim()) missing.push('How it’s made')
  if (!v.techStack.length) missing.push('Tech stack')
  if (!v.githubRepos.length) missing.push('Code repository')
  if (!v.demoLinks.length && !v.websiteUrl) missing.push('Website or demo link') // either gives judges something to open
  return missing
}

/** Field set of a stored version (for diffing / prefilling the form). */
export function fieldsOf(v: Record<string, unknown>): ProjectFields {
  return Object.fromEntries(KEYS.map((k) => [k, v[k] ?? (Array.isArray(v[k]) ? [] : null)])) as ProjectFields
}

// ── Draft & sealed versions ────────────────────────────────────────────────
// A project has one working draft (a ProjectVersion with sealedAt = null) that
// edits change in place. Submitting seals it: the row becomes immutable and the
// submission points at it; the next edit starts a new draft (number + 1).

type VersionState = { sealedAt: Date | null }

export function planSave(current: VersionState, changed: boolean): 'noop' | 'update-draft' | 'new-draft' {
  if (!changed) return 'noop'
  return current.sealedAt ? 'new-draft' : 'update-draft'
}

/** On submit: seal the draft - or, if the latest version is already sealed (no edits since), reuse it. */
export function planSeal(current: VersionState): 'seal-draft' | 'reuse-sealed' {
  return current.sealedAt ? 'reuse-sealed' : 'seal-draft'
}

// ponytail: the generated note marks submission seals - no column needed. Ceiling: a manual note typed as "Submitted to …" reads as one too.
const SUBMITTED_PREFIX = 'Submitted to '
export const submissionNote = (target: string) => `${SUBMITTED_PREFIX}${target}`
/** A version sealed by a submission that no stage entry points at any more was re-submitted with a later version. */
export const wasReplaced = (v: { sealedAt: Date | null; note: string | null; entries: number }) => !!v.sealedAt && v.entries === 0 && !!v.note?.startsWith(SUBMITTED_PREFIX)

export function versionLabel(v: { number: number; sealedAt: Date | null }): string {
  return v.sealedAt ? `Version ${v.number}` : `Version ${v.number} · draft`
}

// ── Team roles ─────────────────────────────────────────────────────────────
// reader: sees the project · writer: + edits, milestones, submits · owner (exactly one): + manages the team.
// Readers are not part of the hackathon team (size, join, snapshot) but still count for judges' COI.

/** Keys are persisted (ProjectMember.role, ProjectInvite.role) - only add. */
export const PROJECT_ROLES = {
  owner: { label: 'Owner' },
  writer: { label: 'Writer' },
  reader: { label: 'Reader' },
} as const
export type ProjectRole = keyof typeof PROJECT_ROLES
/** Roles an owner can give by invite or change to (ownership moves only via transfer). */
export const ASSIGNABLE_ROLES = ['writer', 'reader'] as const
/** Roles that make up the hackathon team - use in Prisma filters: `{ role: { in: TEAM_ROLES } }`. */
export const TEAM_ROLES: string[] = ['owner', 'writer']

export const canEditProject = (role: string) => TEAM_ROLES.includes(role)
export const canManageTeam = (role: string) => role === 'owner'

// ── Milestones ─────────────────────────────────────────────────────────────
// A live roadmap (own table, not versioned): edited in place by the team.

/** Keys are persisted - only add. */
export const MILESTONE_STATUS = {
  planned: { label: 'Planned', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  done: { label: 'Done', tone: 'success' },
  dropped: { label: 'Dropped', tone: 'warning' },
} as const
export type MilestoneStatus = keyof typeof MILESTONE_STATUS

export const MAX_MILESTONES = 30

/** doneAt follows the status: stamped when it becomes done, kept while done, cleared otherwise. */
export function milestoneDoneAt(prev: { status: string; doneAt: Date | null } | null, nextStatus: MilestoneStatus, now: Date): Date | null {
  if (nextStatus !== 'done') return null
  return prev?.status === 'done' ? prev.doneAt : now
}
