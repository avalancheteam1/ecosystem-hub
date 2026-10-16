import { z } from 'zod'
import { isCountryCode } from '@/lib/countries'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { DEFAULT_NETWORK, PROJECT_NETWORKS, type ProjectNetwork } from '@/lib/project-networks'
import { detectPlatform, isSocialPlatform, type SocialPlatformKey } from '@/lib/social-platforms'

// Project fields - builders-hub's submission fields (battle-tested), stored as
// real arrays instead of comma-joined strings. Pure. A save creates a new
// immutable ProjectVersion unless nothing changed (versionChanged).

export const PROJECT_CATEGORIES = ['Consumer', 'DeFi', 'Enterprise', 'Developer Tooling', 'RWA', 'Gaming', 'Social', 'Other (Specify)'] as const
export const TECH_STACK_DEFAULTS = ['Solidity', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Rust', 'Go', 'Python', 'PostgreSQL', 'Foundry', 'Hardhat', 'wagmi', 'viem', 'Avalanche L1', 'Docker', 'x402', 'Account Abstraction']

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .transform((u) => (u && !/^[a-z]+:\/\//i.test(u) ? `https://${u}` : u)) // builders-hub normalizeUrl
  .pipe(z.string().url('Enter a full link, e.g. https://example.com').refine((u) => /^https?:\/\/[^/]*\./i.test(u) || /^https?:\/\/localhost/i.test(u), 'Enter a full link, e.g. https://example.com'))

const optionalUrl = z
  .union([z.literal(''), z.null(), z.undefined(), httpUrl])
  .transform((v) => v || null)

const linkList = (max: number, label: string) =>
  z
    .array(httpUrl)
    .max(max, `At most ${max} ${label}`)
    .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, `Duplicate ${label} aren't allowed`)

const tagged = z.array(z.object({ tag: z.string().trim().max(40), url: httpUrl })).max(10, 'At most 10 links')

// Socials: the tag is a stable platform key - the user's pick if it's a known key, otherwise detected from the URL (or 'other').
const socials = z
  .array(z.object({ tag: z.string().optional(), url: httpUrl }).transform(({ tag, url }): { tag: SocialPlatformKey; url: string } => ({ tag: tag && isSocialPlatform(tag) ? tag : (detectPlatform(url) ?? 'other'), url })))
  .max(10, 'At most 10 links')

/** A calendar date as `YYYY-MM-DD` (no time, no zone - a launch day or a milestone's target day). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date').refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().startsWith(d), 'Pick a valid date')

const NETWORK_KEYS = Object.keys(PROJECT_NETWORKS) as [ProjectNetwork, ...ProjectNetwork[]]

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|loom\.com|vimeo\.com)$/i

export const projectFieldsSchema = z
  .object({
    name: z.string().trim().min(1, 'Project name is required').max(60, 'Max 60 characters'),
    shortDescription: z.string().trim().min(1, 'Short description is required').max(280, 'Max 280 characters'),
    fullDescription: z.string().trim().max(20_000, 'Description is too long'),
    techDescription: z.string().trim().max(10_000),
    techStack: z
      .array(z.string())
      .transform((items) => {
        const seen = new Set<string>()
        return items.map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
      })
      .pipe(z.array(z.string().max(30, 'Tech stack: each technology max 30 characters')).max(20, 'At most 20 technologies')),
    categories: z.array(z.enum(PROJECT_CATEGORIES)).max(8).transform((c) => [...new Set(c)]),
    otherCategory: z.string().trim().max(60).nullable().optional().transform((v) => v || null),
    maturity: z.enum(Object.keys(PROJECT_MATURITY) as [ProjectMaturity, ...ProjectMaturity[]], 'Pick the project stage'),
    launchDate: z.union([z.literal(''), z.null(), isoDate]).optional().transform((v) => v || null),
    country: z.string().nullable().optional().transform((v) => v || null).refine((c) => !c || isCountryCode(c), 'Pick a country from the list'),
    githubRepos: linkList(10, 'repository links'),
    demoLinks: linkList(10, 'demo links').refine((a) => !a.some((u) => /youtube\.com|youtu\.be|loom\.com/i.test(u)), 'Put YouTube and Loom links in the demo video field'),
    videoUrl: optionalUrl.refine((u) => !u || VIDEO_HOSTS.test(new URL(u).hostname), 'Use a YouTube, Loom or Vimeo link'),
    logoUrl: optionalUrl,
    coverUrl: optionalUrl,
    screenshots: z.array(httpUrl).max(5, 'At most 5 screenshots'),
    deployedAddresses: z.array(z.object({ address: z.string().trim().min(1, 'Address is required').max(120), tag: z.string().trim().max(40), network: z.enum(NETWORK_KEYS).default(DEFAULT_NETWORK) })).max(20),
    websites: tagged,
    socials,
  })
  .refine((p) => !p.categories.includes('Other (Specify)') || !!p.otherCategory, { message: 'Please specify the other category', path: ['otherCategory'] })

export type ProjectFields = z.output<typeof projectFieldsSchema>
export type ProjectFieldsInput = z.input<typeof projectFieldsSchema>

const KEYS = ['name', 'shortDescription', 'fullDescription', 'techDescription', 'techStack', 'categories', 'otherCategory', 'maturity', 'launchDate', 'country', 'githubRepos', 'demoLinks', 'videoUrl', 'logoUrl', 'coverUrl', 'screenshots', 'deployedAddresses', 'websites', 'socials'] as const

/** Does saving `next` on top of `prev` warrant a new version? */
export function versionChanged(prev: ProjectFields | null, next: ProjectFields): boolean {
  if (!prev) return true
  return KEYS.some((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null))
}

/** builders-hub's "complete submission" set (minus tracks, chosen at submit time) + project stage. */
export function missingForSubmission(v: { maturity: string | null; fullDescription: string; techDescription: string; techStack: string[]; githubRepos: string[]; demoLinks: string[] }): string[] {
  const missing: string[] = []
  if (!v.maturity) missing.push('Project stage')
  if (!v.fullDescription.trim()) missing.push('Full description')
  if (!v.techDescription.trim()) missing.push('How it’s made')
  if (!v.techStack.length) missing.push('Tech stack')
  if (!v.githubRepos.length) missing.push('Code repository')
  if (!v.demoLinks.length) missing.push('Demo link')
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

export const milestoneSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120, 'Max 120 characters'),
  /** Markdown */
  description: z.string().trim().max(2000, 'Max 2000 characters').optional().transform((v) => v || null),
  targetDate: isoDate,
  status: z.enum(Object.keys(MILESTONE_STATUS) as [MilestoneStatus, ...MilestoneStatus[]]).default('planned'),
})
export type MilestoneInput = z.input<typeof milestoneSchema>
export const MAX_MILESTONES = 30

/** doneAt follows the status: stamped when it becomes done, kept while done, cleared otherwise. */
export function milestoneDoneAt(prev: { status: string; doneAt: Date | null } | null, nextStatus: MilestoneStatus, now: Date): Date | null {
  if (nextStatus !== 'done') return null
  return prev?.status === 'done' ? prev.doneAt : now
}
