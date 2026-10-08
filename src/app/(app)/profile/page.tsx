import type { Metadata } from 'next'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { StatusPill } from '@/components/status-pill'
import { COUNTRIES } from '@/lib/countries'
import { formatShortDate } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { TIER_LABELS } from '@/lib/groups'
import { requireUser } from '@/lib/guards'
import { getPortalProfile } from '@/lib/member-portal'
import { safeNext } from '@/lib/safe-next'
import { getUserGroups } from '@/lib/user-groups'
import { ProfileForm } from './_components/profile-form'

export const metadata: Metadata = { title: 'Your profile', robots: { index: false } }

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser()
  const nextParam = (await searchParams).next
  const [u, profile, { groups }] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: user.id } }), getPortalProfile(user.id), getUserGroups(user.id)])
  const leadGroups = groups.filter((g) => g.lead)
  const portalUrl = process.env.MEMBER_PORTAL_URL || 'https://members.team1.network'
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Your profile" description={nextParam ? 'Add your name, country and at least one role to continue.' : 'How organisers, teammates and judges see you.'} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
        <ProfileForm
          userId={u.id}
          countries={COUNTRIES}
          next={nextParam ? safeNext(nextParam) : null}
          initial={{
            name: u.name, bio: u.bio, country: u.country, builderRoles: u.builderRoles as never, institution: u.institution, companyName: u.companyName, employeeRole: u.employeeRole,
            githubAccount: u.githubAccount, xAccount: u.xAccount, linkedinAccount: u.linkedinAccount, telegramAccount: u.telegramAccount, otherSocials: u.otherSocials, wallets: u.wallets, skills: u.skills,
            newsletterOptIn: u.newsletterOptIn, image: u.image,
          }}
        />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Membership and links">
          {profile?.tier && (
            <div className="rounded-xl border border-line bg-surface-2 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm text-fg-heading">team1 membership</h2>
                <StatusPill tone="info">{TIER_LABELS[profile.tier]}</StatusPill>
              </div>
              {profile.chapters.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm text-fg-body">
                  {profile.chapters.map((c) => (
                    <li key={c.slug} className="flex flex-wrap items-center gap-2">
                      <span>{c.name}</span>
                      {c.primary && <StatusPill>primary</StatusPill>}
                      {c.lead && <StatusPill tone="info">lead</StatusPill>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-fg-faint">From the member portal · updated {formatShortDate(profile.fetchedAt, 'UTC')}</p>
            </div>
          )}
          <div className="rounded-xl border border-line bg-surface-2 px-5 py-2">
            <ul className="divide-y divide-line text-sm">
              <li><Link href="/referrals" className="flex min-h-11 items-center text-fg-body hover:text-fg-heading">Your referral links</Link></li>
              <li>
                <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-2 text-fg-body hover:text-fg-heading">
                  Member portal <ExternalLink className="size-4" aria-hidden />
                </a>
              </li>
              {leadGroups.map((g) => (
                <li key={g.group.id}><Link href={`/groups/${g.group.slug}`} className="flex min-h-11 items-center text-fg-body hover:text-fg-heading">Group stats · {g.group.name}</Link></li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
