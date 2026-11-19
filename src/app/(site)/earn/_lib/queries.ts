import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/guards'
import { EARN_PAGE_SIZE, escapeSearchTerm, type earnCatalogFilters } from './rules'
import { bountyIdSchema } from './schemas'

const published = { publishedAt: { not: null } } satisfies Prisma.EarnBountyWhereInput
const cardFields = { id: true, title: true, category: true, deadline: true, reward: true, hubModule: true } satisfies Prisma.EarnBountySelect

export async function listPublicBounties(filters: ReturnType<typeof earnCatalogFilters>, now: Date) {
  const search = filters.q ? { contains: escapeSearchTerm(filters.q), mode: 'insensitive' as const } : null
  const rows = await prisma.earnBounty.findMany({
    where: {
      ...published,
      ...(filters.status === 'all' ? {} : { deadline: filters.status === 'open' ? { gt: now } : { lte: now } }),
      ...(filters.type === 'all' ? {} : { hubModule: filters.type === 'standard' ? null : { not: null } }),
      ...(search ? { OR: [{ title: search }, { hubModule: search }] } : {}),
    },
    select: cardFields,
    orderBy: [{ deadline: filters.status === 'closed' ? 'desc' : 'asc' }, { id: 'asc' }],
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
    },
  })
}

export async function listEarnSitemapEntries() {
  return prisma.earnBounty.findMany({
    where: published,
    select: { id: true, updatedAt: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 10000,
  })
}

export async function listBountiesForPublishing(page: number) {
  await requirePermission('earn.publish')
  const rows = await prisma.earnBounty.findMany({
    select: { id: true, title: true, publishedAt: true, deadline: true },
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
      publishedAt: true, revision: true,
    },
  })
}
