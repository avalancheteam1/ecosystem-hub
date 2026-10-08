import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GroupStats } from '@/app/(app)/referrals/_components/group-stats'
import { getGroupStats } from '@/app/(app)/referrals/_lib/queries'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { prisma } from '@/lib/db'
import { canViewGroup } from '@/lib/groups'
import { requireUser } from '@/lib/guards'
import { getUserGroups } from '@/lib/user-groups'

export const metadata: Metadata = { title: 'Group', robots: { index: false } }

/** Lead view: per-object power (lead of this group, manual or portal) or referrals.view. Otherwise 404. */
export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser()
  const { slug } = await params
  const group = await prisma.group.findUnique({ where: { slug }, select: { id: true, name: true } })
  if (!group) notFound()
  const { groups } = await getUserGroups(user.id)
  if (!canViewGroup(user, group.id, groups)) notFound()
  const stats = await getGroupStats(group.id)
  return (
    <>
      <PageHeader title={group.name} description="New hub accounts brought in by this group's members — counted for every group the referrer was in when the person signed up." />
      <SectionCard title="Onboardings"><GroupStats stats={stats} /></SectionCard>
    </>
  )
}
