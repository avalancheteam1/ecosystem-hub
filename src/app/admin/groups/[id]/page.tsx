import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { GroupStats } from '@/app/(app)/referrals/_components/group-stats'
import { canSeeGroupsAdmin } from '@/app/(app)/referrals/_lib/nav'
import { getGroupStats } from '@/app/(app)/referrals/_lib/queries'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { portalKeyConfigured } from '@/lib/member-portal'
import { can } from '@/lib/permissions'
import { AddMemberDialog, DeleteGroupButton, GroupDialog, MemberActions } from '../_components/group-forms'

export const metadata: Metadata = { title: 'Group' }

export default async function AdminGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!canSeeGroupsAdmin(user)) notFound()
  const { id } = await params
  const group = await prisma.group.findUnique({
    where: { id },
    include: { members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }] } },
  })
  if (!group) notFound()
  const manage = can(user, 'groups.manage')
  const chapter = group.portalChapterSlug
  const [stats, chapterMembers] = await Promise.all([
    getGroupStats(group.id),
    chapter
      ? prisma.portalChapterMembership.findMany({
          where: { chapterSlug: chapter },
          include: { profile: { include: { user: { select: { id: true, name: true, email: true } } } } },
          orderBy: [{ lead: 'desc' }, { profile: { user: { name: 'asc' } } }],
        })
      : Promise.resolve([]),
  ])
  return (
    <>
      <BackLink href="/admin/groups">Groups</BackLink>
      <PageHeader title={group.name} description={chapter ? `Chapter group from the member portal · lead page: /groups/${group.slug}` : `Lead page: /groups/${group.slug}`}>
        {manage && !chapter && (
          <>
            <GroupDialog group={{ id: group.id, name: group.name, slug: group.slug }} trigger={<Button variant="outline">Edit</Button>} />
            <DeleteGroupButton id={group.id} name={group.name} onboardings={stats.total} />
          </>
        )}
      </PageHeader>
      {!portalKeyConfigured() && chapter && <p className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">MEMBER_PORTAL_API_KEY is not set - chapter groups get no members and new referrals are snapshotted without them.</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Onboardings"><GroupStats stats={stats} /></SectionCard>
        <SectionCard title="Members" actions={manage && !chapter ? <AddMemberDialog groupId={group.id} /> : undefined}>
          {chapter && <p className="mb-4 text-sm text-fg-muted">Managed in the member portal. Shows hub users who have signed in.</p>}
          {chapter ? (
            chapterMembers.length === 0 ? (
              <p className="text-sm text-fg-muted">No hub users in this chapter yet - members appear after they sign in to the hub.</p>
            ) : (
              <ul className="divide-y divide-line">
                {chapterMembers.map((m) => (
                  <li key={m.userId} className="flex min-h-12 items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="text-fg-heading">{m.profile.user.name}</span> {manage && <span className="text-sm text-fg-faint">{m.profile.user.email}</span>}
                      {m.lead && <StatusPill tone="info" className="ml-2">lead</StatusPill>}
                      {m.primary && <StatusPill className="ml-2">primary</StatusPill>}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) :
          group.members.length === 0 ? (
            <p className="text-sm text-fg-muted">No manual members.</p>
          ) : (
            <ul className="divide-y divide-line">
              {group.members.map((m) => (
                <li key={m.userId} className="flex min-h-12 items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="text-fg-heading">{m.user.name}</span> {manage && <span className="text-sm text-fg-faint">{m.user.email}</span>}
                    {m.isLead && <StatusPill tone="info" className="ml-2">lead</StatusPill>}
                  </span>
                  {manage && <MemberActions groupId={group.id} userId={m.userId} isLead={m.isLead} />}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  )
}
