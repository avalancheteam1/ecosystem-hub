import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import { countingGroups, mergeGroups, type UserGroup } from '@/lib/groups'
import { getPortalProfile } from '@/lib/member-portal'

const groupRef = { id: true, slug: true, name: true, portalChapterSlug: true } as const

/**
 * A user's groups: manual rows + chapter groups from the stored portal copy (no live call). Once per request.
 * `counting` = the subset an onboarding counts for (manual groups + the primary chapter only).
 */
export const getUserGroups = cache(async (userId: string): Promise<{ groups: UserGroup[]; counting: UserGroup[] }> => {
  const [manual, profile] = await Promise.all([
    prisma.groupMember.findMany({ where: { userId }, select: { isLead: true, group: { select: groupRef } } }),
    getPortalProfile(userId),
  ])
  const chapters = profile?.chapters ?? []
  const linked = chapters.length ? await prisma.group.findMany({ where: { portalChapterSlug: { in: chapters.map((c) => c.slug) } }, select: groupRef }) : []
  const groups = mergeGroups(manual, chapters, linked)
  return { groups, counting: countingGroups(groups, chapters) }
})
