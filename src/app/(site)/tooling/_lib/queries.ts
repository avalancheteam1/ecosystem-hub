import 'server-only'
import { cache } from 'react'
import { TEAM_ROLES } from '@/app/(app)/projects/_lib/rules'
import { prisma } from '@/lib/db'
import { activityLabel } from '@/lib/project-activity'
import { CHECKED_FIELDS, newerVersion, PAGE_SIZE, toolSearchWhere, type PublicTool } from './rules'

/** Listed = a reviewer approved a version, the listing is open and the project isn't deleted. */
const listed = { approvedVersionId: { not: null }, closedAt: null, project: { archivedAt: null } }
const ref = { select: { id: true, number: true } } as const
const latestSealed = { where: { sealedAt: { not: null } }, orderBy: { number: 'desc' }, take: 1 } as const

/** Public cards: project data from the approved version only, never the team; newest approval first. */
async function readToolCards(take: number, skip = 0, q?: string): Promise<PublicTool[]> {
  const search = toolSearchWhere(q)
  const rows = await prisma.toolingListing.findMany({
    where: { ...listed, ...(search ? { approvedVersion: search } : {}) },
    orderBy: [{ approvedAt: 'desc' }, { id: 'asc' }],
    skip,
    take,
    select: { project: { select: { slug: true } }, approvedVersion: { select: { name: true, shortDescription: true, logoUrl: true } } },
  })
  return rows.flatMap((r) => (r.approvedVersion ? [{ slug: r.project.slug, ...r.approvedVersion }] : []))
}

/** The first `limit` cards of `/tooling` for the `/ecosystem` preview (same filter and order, fetches only what is shown). */
export function listPublicToolPreview(limit: number) {
  return readToolCards(limit)
}

/** One page of `/tooling`, with a lookahead row for `hasMore`. */
export async function listPublicTools({ q, page }: { q?: string; page: number }): Promise<{ tools: PublicTool[]; hasMore: boolean }> {
  const tools = await readToolCards(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE, q)
  const hasMore = tools.length > PAGE_SIZE
  if (hasMore) tools.pop()
  return { tools, hasMore }
}

/** Whether anything is listed at all (the empty state: "nothing listed yet" vs "no match"). */
export async function anyPublicTool() {
  return !!(await prisma.toolingListing.findFirst({ where: listed, select: { id: true } }))
}

/** Every listed tool's slug for the sitemap. */
export async function listPublicToolSlugs() {
  const rows = await prisma.toolingListing.findMany({ where: listed, orderBy: { id: 'asc' }, select: { approvedAt: true, project: { select: { slug: true } } } })
  return rows.map((r) => ({ slug: r.project.slug, approvedAt: r.approvedAt }))
}

/** One listed tool by its project slug, or null (not listed, withdrawn, removed or deleted). The whole approved version: the page renders it like a project page (`ProjectVersionView`), which shows no team. */
export const getPublicTool = cache(async (slug: string) => {
  const r = await prisma.toolingListing.findFirst({ where: { ...listed, project: { slug, archivedAt: null } }, select: { approvedAt: true, approvedVersion: true, project: { select: { slug: true } } } })
  return r?.approvedVersion ? { slug: r.project.slug, approvedAt: r.approvedAt, version: r.approvedVersion } : null
})

/** My projects (owner / writer) with their listing, for the submit page. */
export async function listMyToolingProjects(userId: string) {
  return prisma.project.findMany({
    where: { archivedAt: null, members: { some: { userId, role: { in: TEAM_ROLES } } } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      slug: true,
      currentVersion: { select: { ...CHECKED_FIELDS, name: true } },
      toolingListing: {
        select: {
          approvedVersionId: true, pendingVersionId: true, rejectedVersionId: true, rejectedAt: true, rejectReason: true, rejectReasonInternal: true,
          approvedAt: true, closedAt: true, closedReason: true, removedVersionId: true, removedReason: true, removedReasonInternal: true, approvedVersion: ref, pendingVersion: ref,
        },
      },
    },
  })
}

export const REVIEW_PAGE_SIZE = 50
export const REVIEW_FILTERS = ['all', 'review', 'listed', 'closed'] as const
export type ReviewFilter = (typeof REVIEW_FILTERS)[number]
const reviewFilterWhere: Record<ReviewFilter, object> = {
  all: {},
  review: { pendingVersionId: { not: null }, closedAt: null, project: { archivedAt: null } },
  listed,
  closed: { OR: [{ closedAt: { not: null } }, { project: { archivedAt: { not: null } } }] },
}

/** How many listings match `filter` (admin overview). */
export const countListings = (filter: ReviewFilter) => prisma.toolingListing.count({ where: reviewFilterWhere[filter] })

/** One page of the review queue (search on the project's current name), with each project's newest sealed version (a reviewer can approve a newer one directly). */
export const REVIEW_SORTS = ['name', 'submitted', 'approved', 'updated'] as const
export type ReviewSort = { key: (typeof REVIEW_SORTS)[number]; dir: 'asc' | 'desc' }
const reviewOrder = ({ key, dir }: ReviewSort) =>
  key === 'name' ? { project: { currentVersion: { name: dir } } }
  : key === 'submitted' ? { submittedAt: { sort: dir, nulls: 'last' as const } }
  : key === 'approved' ? { approvedAt: { sort: dir, nulls: 'last' as const } }
  : { updatedAt: dir }

export async function listListingsForReview({ q, filter, page, sort }: { q?: string; filter: ReviewFilter; page: number; sort: ReviewSort }) {
  const rows = await prisma.toolingListing.findMany({
    where: { AND: [reviewFilterWhere[filter], q ? { project: { currentVersion: { name: { contains: q, mode: 'insensitive' } } } } : {}] },
    orderBy: [reviewOrder(sort), { id: 'asc' }],
    skip: (page - 1) * REVIEW_PAGE_SIZE,
    take: REVIEW_PAGE_SIZE + 1,
    include: {
      project: { select: { slug: true, archivedAt: true, currentVersion: { select: { name: true } }, versions: { ...latestSealed, select: CHECKED_FIELDS } } },
      approvedVersion: ref,
      pendingVersion: ref,
    },
  })
  const pageRows = rows.slice(0, REVIEW_PAGE_SIZE)
  // Who submitted last: names only, no emails (reviewers only).
  const ids = [...new Set(pageRows.flatMap((r) => (r.submittedById ? [r.submittedById] : [])))]
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
  const names = new Map(users.map((u) => [u.id, u.name]))
  return {
    rows: pageRows.map((r) => ({ ...r, newer: newerVersion(r, r.project.versions[0] ?? null), submittedBy: r.submittedById ? names.get(r.submittedById) ?? 'a deleted user' : null })),
    hasMore: rows.length > REVIEW_PAGE_SIZE,
  }
}

/** One listing with the full versions a reviewer looks at, the names behind it (no emails) and its history (the listing's rows of the project activity log). */
export async function getListingForReview(id: string) {
  const r = await prisma.toolingListing.findUnique({
    where: { id },
    include: { project: { select: { slug: true, archivedAt: true, currentVersion: { select: { name: true } }, versions: latestSealed } }, approvedVersion: true, pendingVersion: true },
  })
  if (!r) return null
  // The listing's history: its rows of the project's activity log (src/lib/project-activity.ts), newest first.
  const activity = await prisma.projectActivity.findMany({
    where: { projectId: r.projectId, program: 'tooling', targetId: r.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, event: true, reason: true, reasonInternal: true, actorId: true, createdAt: true, version: { select: { number: true } } },
  })
  const userIds = [...new Set([r.submittedById, r.closedById, ...activity.map((a) => a.actorId)].filter((x): x is string => !!x))]
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  const name = (uid: string | null) => (uid ? users.find((u) => u.id === uid)?.name ?? 'a deleted user' : null)
  return {
    ...r,
    newer: newerVersion(r, r.project.versions[0] ?? null),
    names: { submitted: name(r.submittedById), closed: name(r.closedById) },
    history: activity.map((a) => ({ id: a.id, at: a.createdAt, event: activityLabel(a.event), number: a.version?.number ?? null, by: name(a.actorId) ?? '-', reason: a.reason, internal: a.reasonInternal })),
  }
}
