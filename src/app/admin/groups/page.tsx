import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { canSeeGroupsAdmin } from '@/app/(app)/referrals/_lib/nav'
import { PageHeader } from '@/components/layout/page-header'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  const syncError = await syncChapterGroups()
  const [rows, total, chapterCounts] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { members: true, referrals: true } } } }),
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
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead className="text-right">Onboardings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.id}>
                <TableCell><Link href={`/admin/groups/${g.id}`} className="text-fg-heading hover:underline">{g.name}</Link></TableCell>
                <TableCell>{g.portalChapterSlug ? <StatusPill tone="info">Chapter</StatusPill> : <StatusPill>Manual</StatusPill>}</TableCell>
                <TableCell className="text-right tabular-nums">{g.portalChapterSlug ? (counts.get(g.portalChapterSlug) ?? 0) : g._count.members}</TableCell>
                <TableCell className="text-right tabular-nums">{g._count.referrals}</TableCell>
              </TableRow>
            ))}
            {groups.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-12 text-center text-fg-muted">No groups yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
