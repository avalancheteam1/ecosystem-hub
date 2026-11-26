import 'server-only'
import type { Prisma } from '@prisma/client'
import { EARN_ORG_TYPES } from '@/lib/campus'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/guards'
import { EARN_PAGE_SIZE, escapeSearchTerm, type earnCatalogFilters } from './rules'
import { bountyIdSchema } from './schemas'

const published = { publishedAt: { not: null }, cancelledAt: null } satisfies Prisma.EarnBountyWhereInput
const stageFields = {
  id: true, position: true, title: true, deliverables: true, requiresPrevApproval: true,
  requiresPullRequest: true, submissionPolicy: true, approvalLimit: true,
} satisfies Prisma.EarnStageSelect
const cardFields = {
  id: true, title: true, category: true, deadline: true, reward: true, hubModule: true, resultsAnnouncedAt: true,
  logoUrl: true, organization: { select: { name: true } },
} satisfies Prisma.EarnBountySelect

export async function listPublicBounties(filters: ReturnType<typeof earnCatalogFilters>, now: Date) {
  const search = filters.q ? { contains: escapeSearchTerm(filters.q), mode: 'insensitive' as const } : null
  const rows = await prisma.earnBounty.findMany({
    where: {
      ...published,
      ...(filters.status === 'open' ? { deadline: { gt: now }, resultsAnnouncedAt: null } : {}),
      ...(filters.status === 'closed' ? { deadline: { lte: now }, resultsAnnouncedAt: null } : {}),
      ...(filters.status === 'announced' ? { resultsAnnouncedAt: { not: null } } : {}),
      ...(filters.type === 'all' ? {} : { hubModule: filters.type === 'standard' ? null : { not: null } }),
      ...(search ? { OR: [{ title: search }, { hubModule: search }] } : {}),
    },
    select: cardFields,
    orderBy: [{ deadline: filters.status === 'closed' || filters.status === 'announced' ? 'desc' : 'asc' }, { id: 'asc' }],
    skip: (filters.page - 1) * EARN_PAGE_SIZE,
    take: EARN_PAGE_SIZE + 1,
  })
  return { rows: rows.slice(0, EARN_PAGE_SIZE), hasMore: rows.length > EARN_PAGE_SIZE }
}

export async function getPublicBounty(id: string) {
  if (!bountyIdSchema.safeParse(id).success) return null
  return prisma.earnBounty.findUnique({
    where: { id, ...published },
    select: {
      ...cardFields,
      description: true, deliverables: true, participation: true, participationUrl: true, githubIssueUrl: true,
      terms: true, termsVersion: true, resultsNote: true,
      stages: { orderBy: { position: 'asc' }, select: stageFields },
    },
  })
}

export async function listEarnSitemapEntries() {
  return prisma.earnBounty.findMany({
    where: published,
    select: { id: true, publishedAt: true, resultsAnnouncedAt: true },
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    take: 10000,
  })
}

export async function listBountiesForPublishing(page: number) {
  await requirePermission('earn.publish')
  const rows = await prisma.earnBounty.findMany({
    select: { id: true, title: true, publishedAt: true, deadline: true, cancelledAt: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * EARN_PAGE_SIZE,
    take: EARN_PAGE_SIZE + 1,
  })
  return { rows: rows.slice(0, EARN_PAGE_SIZE), hasMore: rows.length > EARN_PAGE_SIZE }
}

export async function getBountyForPublishing(id: string) {
  await requirePermission('earn.publish')
  if (!bountyIdSchema.safeParse(id).success) return null
  return prisma.earnBounty.findUnique({
    where: { id },
    select: {
      ...cardFields,
      description: true, deliverables: true, participation: true, participationUrl: true, githubIssueUrl: true,
      publishedAt: true, revision: true, terms: true, cancelledAt: true, cancellationReason: true, organizationId: true,
      stages: { orderBy: { position: 'asc' }, select: stageFields },
    },
  })
}

export async function listEarnOrganizationOptions() {
  await requirePermission('earn.publish')
  return prisma.organization.findMany({
    where: { type: { in: [...EARN_ORG_TYPES] }, hidden: false },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, type: true },
  })
}
