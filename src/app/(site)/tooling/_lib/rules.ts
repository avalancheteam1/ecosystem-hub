// Pure, isomorphic rules for the tooling area (tested in tests/tooling.test.ts).
import { missingForSubmission } from '@/app/(app)/projects/_lib/rules'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'

export const TOOLING_CATEGORY = 'Developer Tooling'
/** Project stages that can be listed. */
export const LISTABLE_STAGES: readonly string[] = ['live', 'established'] satisfies ProjectMaturity[]
/** What the builder agrees to on submit; stored as `consentAt` / `consentById` on the listing. */
export const TOOLING_CONSENT = 'If approved, this project and later versions approved by team1 will be listed publicly on /tooling.'
export const REJECT_REASON_MAX = 1000
/** Note on a version sealed by a tooling submission. Not `submissionNote()`: that prefix marks hackathon versions as "replaced" when no stage entry points at them. */
export const SEAL_NOTE = 'Sent for Developer Tooling review'
export const PAGE_SIZE = 12 // divisible by the 2/3-column grid
export const QUERY_MAX = 80

export const toolHref = (t: { slug: string }) => `/tooling/${t.slug}`

/** The fields the listing checks read from a project version (`CHECKED_FIELDS` selects them). */
export type CheckedVersion = Parameters<typeof missingForSubmission>[0] & { categories: string[] }

/** What a version still needs before it can be listed (empty = listable). The same checks run on submit and on approve. */
export function listingProblems(v: CheckedVersion): string[] {
  const out: string[] = []
  if (!v.categories.includes(TOOLING_CATEGORY)) out.push(`Category “${TOOLING_CATEGORY}”`)
  if (v.maturity && !LISTABLE_STAGES.includes(v.maturity)) {
    const stages = LISTABLE_STAGES.map((s) => PROJECT_MATURITY[s as ProjectMaturity].label).join(' or ')
    out.push(`Stage ${stages} (it is ${PROJECT_MATURITY[v.maturity as ProjectMaturity]?.label ?? v.maturity})`)
  }
  return [...out, ...missingForSubmission(v)]
}

type Ref = { id: string; number: number } | null
/** Prisma `select` for `CheckedVersion` plus what approving needs. */
export const CHECKED_FIELDS = {
  id: true, number: true, sealedAt: true, categories: true, maturity: true, fullDescription: true, techDescription: true,
  techStack: true, githubRepos: true, demoLinks: true, websiteUrl: true,
} as const

/** The listing state the review rules need. */
export type ListingState = { closedAt: Date | null; approvedVersion: Ref; pendingVersion: Ref; rejectedVersionId?: string | null }

/**
 * The newest sealed version when it is newer than both the listed and the pending one, so a reviewer can
 * approve it without the team resubmitting (they agreed to later versions being listed). Only for open listings
 * that have something listed or pending, and never the version a reviewer just rejected; a rejected or closed
 * listing needs a new submission.
 */
export function newerVersion<V extends { id: string; number: number }>(l: ListingState, latestSealed: V | null): V | null {
  if (!latestSealed || l.closedAt || (!l.approvedVersion && !l.pendingVersion) || latestSealed.id === l.rejectedVersionId) return null
  return latestSealed.number > Math.max(l.approvedVersion?.number ?? 0, l.pendingVersion?.number ?? 0) ? latestSealed : null
}

/** Why a reviewer can't approve this version on this listing, or null when they can. */
export function approveProblem(l: ListingState, v: CheckedVersion & { id: string; number: number; sealedAt: Date | null }, projectArchived: boolean): string | null {
  if (projectArchived) return 'The project was deleted'
  if (l.closedAt) return 'The listing was withdrawn or removed'
  if (!l.approvedVersion && !l.pendingVersion) return 'Nothing is waiting for review'
  if (!v.sealedAt) return 'Only saved versions can be approved, not the draft'
  if (v.id === l.rejectedVersionId) return `Version ${v.number} was rejected; the team submits a new one`
  if (l.approvedVersion && v.number <= l.approvedVersion.number) return `Version ${v.number} is not newer than the listed one`
  if (l.pendingVersion && v.number < l.pendingVersion.number) return `A newer version (${l.pendingVersion.number}) is waiting for review`
  const problems = listingProblems(v)
  return problems.length ? `It still needs: ${problems.join(', ')}` : null
}

/**
 * Why the team can't submit this version right now, or null. Closed listings show nothing, so only a rejected version
 * blocks there; the team edits the project (a new version) before trying again.
 */
export function submitBlock(l: { closedAt: Date | null; approvedVersionId: string | null; pendingVersionId: string | null; rejectedVersionId: string | null } | null, versionId: string): string | null {
  if (!l) return null
  if (l.rejectedVersionId === versionId) return 'This version wasn’t approved. Edit the project before submitting again.'
  if (l.closedAt) return null
  if (l.approvedVersionId === versionId) return 'This version is listed. Edit the project to submit an update.'
  if (l.pendingVersionId === versionId) return 'This version is waiting for review.'
  return null
}

/** Why the listing is off the list, for the team: removed by a reviewer (with their reason) or withdrawn by the team. */
export function closedState(l: { closedAt: Date | null; closedReason: string | null; closedNote: string | null }): { by: 'team' | 'reviewer'; reason: string | null } | null {
  if (!l.closedAt) return null
  return l.closedReason === 'removed' ? { by: 'reviewer', reason: l.closedNote } : { by: 'team', reason: null }
}

/** The rejection reason the team may see: none when the reviewer marked it internal. */
export const visibleRejectReason = (l: { rejectReason: string | null; rejectReasonInternal: boolean }) => (l.rejectReasonInternal ? null : l.rejectReason)

/** Lower-case and strip accents, so "evalanche" finds "Évalanche" and the other way round. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()

/** Every word of the query must appear somewhere in `fields`. */
export function matchesQuery(fields: string[], q: string | undefined): boolean {
  const words = fold(q ?? '').split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fold(fields.join(' '))
  return words.every((w) => hay.includes(w))
}

/** A listed tool as the public pages see it: project data only, never the team. */
export type PublicTool = { slug: string; name: string; shortDescription: string; logoUrl: string | null }

/** The list page for `?q=&page=`: tools matching the search (name and short description), the page clamped to the last one. */
export function viewTools<T extends PublicTool>(tools: T[], opts: { q?: string; page: number }) {
  const found = tools.filter((t) => matchesQuery([t.name, t.shortDescription], opts.q))
  const pages = Math.max(1, Math.ceil(found.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, opts.page), pages)
  return { found: found.length, page, hasMore: page < pages, tools: found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) }
}

type Tagged = { tag: string; url: string }
/** A tool page's buttons from its approved version: website first, then code, demos, video and further sites. Duplicate URLs once. */
export function toolLinks(v: { websiteUrl: string | null; githubRepos: string[]; demoLinks: string[]; videoUrl: string | null; websites: unknown }): { label: string; url: string }[] {
  const numbered = (label: string, urls: string[]) => urls.map((url, i) => ({ label: urls.length > 1 ? `${label} ${i + 1}` : label, url }))
  const websites = Array.isArray(v.websites) ? (v.websites as Tagged[]).filter((w) => w?.url) : []
  const all = [
    ...(v.websiteUrl ? [{ label: 'Website', url: v.websiteUrl }] : []),
    ...numbered('Code', v.githubRepos),
    ...numbered('Demo', v.demoLinks),
    ...(v.videoUrl ? [{ label: 'Video', url: v.videoUrl }] : []),
    ...websites.map((w) => ({ label: w.tag?.trim() || 'Link', url: w.url })),
  ]
  return all.filter((l, i) => /^https?:\/\//.test(l.url) && all.findIndex((x) => x.url === l.url) === i)
}

/** Two-letter fallback when a tool has no logo: "AVAX Toolkit" → "AT", "Wolfie" → "WO". */
export function initials(name: string) {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? parts[0][1] ?? '')).toUpperCase()
}
