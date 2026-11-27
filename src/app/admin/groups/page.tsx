import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { canSeeGroupsAdmin } from '@/app/(app)/referrals/_lib/nav'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { portalKeyConfigured, syncChapterGroups } from '@/lib/member-portal'
import { can } from '@/lib/permissions'
import { GroupDialog } from './_components/group-forms'

export const metadata: Metadata = { title: 'Groups' }

const notice = 'mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm'

export default async function AdminGroupsPage() {
  const user = await requireUser()
  if (!canSeeGroupsAdmin(user)) notFound()
  const manage = can(user, 'groups.manage')
  const syncP = syncChapterGroups()
  const [syncError, rows, total, chapterCounts] = await Promise.all([
    syncP,
    // the list includes the chapter groups the sync may have just created
    syncP.then(() => prisma.group.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { members: true, referrals: true } } } })),
    can(user, 'referrals.view') ? prisma.referral.count() : Promise.resolve(null),
    prisma.portalChapterMembership.groupBy({ by: ['chapterSlug'], _count: { _all: true } }),
  ])
  const counts = new Map(chapterCounts.map((c) => [c.chapterSlug, c._count._all]))
  const groups = [...rows.filter((g) => g.portalChapterSlug), ...rows.filter((g) => !g.portalChapterSlug)] // each already by name
  return (
    <>
      <PageHeader title="Groups" description={`${total === null ? 'Teams of builders and their onboardings.' : `${total} ${total === 1 ? 'onboarding' : 'onboardings'} across the hub. A referral counts for every group its referrer was in at sign-up.`} Chapter groups come from the member portal automatically.`}>
        {manage && <GroupDialog trigger={<Button><Plus aria-hidden /> New group</Button>} />}
      </PageHeader>
      {syncError && <p className={notice}>Couldn&apos;t load chapters from the member portal: {syncError}</p>}
      {!portalKeyConfigured() && <p className={notice}>MEMBER_PORTAL_API_KEY is not set - chapter groups get no members and new referrals are snapshotted without them.</p>}
      <DataTable
        id="admin-groups"
        empty="No groups yet."
        columns={[
          { key: 'name', label: 'Group', sortable: true, hideable: false },
          { key: 'type', label: 'Type', sortable: true },
          { key: 'members', label: 'Members', sortable: true, firstDir: 'desc', className: 'text-right tabular-nums' },
          { key: 'onboardings', label: 'Onboardings', sortable: true, firstDir: 'desc', className: 'text-right tabular-nums' },
        ]}
        rows={groups.map((g) => {
          const members = g.portalChapterSlug ? (counts.get(g.portalChapterSlug) ?? 0) : g._count.members
          return {
            id: g.id,
            sort: { name: g.name, type: g.portalChapterSlug ? 'chapter' : 'manual', members, onboardings: g._count.referrals },
            cells: {
              name: <Link href={`/admin/groups/${g.id}`} className="text-fg-heading hover:underline">{g.name}</Link>,
              type: g.portalChapterSlug ? <StatusPill tone="info">Chapter</StatusPill> : <StatusPill>Manual</StatusPill>,
              members,
              onboardings: g._count.referrals,
            },
          }
        })}
      />
    </>
  )
}
