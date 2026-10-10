import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { requireUser } from '@/lib/guards'
import { ensureReferralCode } from '@/lib/referral-codes'
import { getUserGroups } from '@/lib/user-groups'
import { CodeTable, CreateCodeDialog } from './_components/codes'
import { MonthBars } from './_components/group-stats'
import { getMyReferrals } from './_lib/queries'
import { MAX_CODES_PER_USER } from './_lib/rules'

export const metadata: Metadata = { title: 'Referrals', robots: { index: false } }

export default async function ReferralsPage() {
  const user = await requireUser()
  await ensureReferralCode(user.id)
  const [{ codes, stats }, { counting }] = await Promise.all([getMyReferrals(user.id), getUserGroups(user.id)])
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'
  return (
    <>
      <PageHeader title="Referrals" description="Share a link with your code. Everyone who signs up through it counts as your onboarding - add ?ref=yourcode to any hub link.">
        <CreateCodeDialog disabled={codes.length >= MAX_CODES_PER_USER} />
      </PageHeader>
      {counting.length > 0 && (
        <p className="mb-6 text-sm text-fg-muted">Your onboardings count for: <span className="text-fg-heading">{counting.map((g) => g.group.name + (g.group.portalChapterSlug ? ' (primary chapter)' : '')).join(', ')}</span></p>
      )}
      {codes.length === 0 ? (
        <EmptyState title="No referral codes yet" action={<CreateCodeDialog disabled={false} />}>Create a code, share the link, and see how many builders you bring to the hub.</EmptyState>
      ) : (
        <div className="space-y-6">
          <SectionCard title={`${stats.total} ${stats.total === 1 ? 'onboarding' : 'onboardings'}`} description="New hub accounts created through your links.">
            <MonthBars perMonth={stats.perMonth} />
          </SectionCard>
          <CodeTable codes={codes} siteUrl={siteUrl} />
        </div>
      )}
    </>
  )
}
