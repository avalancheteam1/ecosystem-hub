import 'server-only'
import { cache } from 'react'
import { TEAM_ROLES } from '@/app/(app)/projects/_lib/rules'
import { prisma } from '@/lib/db'
import { CHECKED_FIELDS, newerVersion, type PublicTool } from './rules'

/** Listed = a reviewer approved a version, the listing is open and the project isn't deleted. */
const listed = { approvedVersionId: { not: null }, closedAt: null, project: { archivedAt: null } }
const ref = { select: { id: true, number: true } } as const
const latestSealed = { where: { sealedAt: { not: null } }, orderBy: { number: 'desc' }, take: 1 } as const
/** What the public tool page shows: project data only, never who made it. */
const publicFields = { name: true, shortDescription: true, fullDescription: true, techDescription: true, logoUrl: true, websiteUrl: true, githubRepos: true, demoLinks: true, videoUrl: true, websites: true } as const

/** Every listed tool, newest approval first. Project data from the approved version only, never the team. */
export async function listPublicTools(): Promise<(PublicTool & { approvedAt: Date | null })[]> {
  const rows = await prisma.toolingListing.findMany({
    where: listed,
    orderBy: { approvedAt: 'desc' },
    select: { approvedAt: true, project: { select: { slug: true } }, approvedVersion: { select: { name: true, shortDescription: true, logoUrl: true } } },
  })
  return rows.flatMap((r) => (r.approvedVersion ? [{ slug: r.project.slug, approvedAt: r.approvedAt, ...r.approvedVersion }] : []))
}

/** One listed tool by its project slug, or null (not listed, withdrawn, removed or deleted). */
export const getPublicTool = cache(async (slug: string) => {
  const r = await prisma.toolingListing.findFirst({ where: { ...listed, project: { slug, archivedAt: null } }, select: { approvedAt: true, approvedVersion: { select: publicFields }, project: { select: { slug: true } } } })
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
          closedAt: true, closedReason: true, closedNote: true, approvedVersion: ref, pendingVersion: ref,
        },
      },
    },
  })
}

/** Every listing for the review queue, with the project's newest sealed version (a reviewer can approve a newer one directly). */
export async function listListingsForReview() {
  const rows = await prisma.toolingListing.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      project: { select: { slug: true, archivedAt: true, currentVersion: { select: { name: true } }, versions: { ...latestSealed, select: CHECKED_FIELDS } } },
      approvedVersion: ref,
      pendingVersion: ref,
    },
  })
  return rows.map((r) => ({ ...r, newer: newerVersion(r, r.project.versions[0] ?? null) }))
}

/** One listing with the full versions a reviewer looks at. */
export async function getListingForReview(id: string) {
  const r = await prisma.toolingListing.findUnique({
    where: { id },
    include: { project: { select: { slug: true, archivedAt: true, currentVersion: { select: { name: true } }, versions: latestSealed } }, approvedVersion: true, pendingVersion: true },
  })
  if (!r) return null
  return { ...r, newer: newerVersion(r, r.project.versions[0] ?? null) }
}
