import crypto from 'node:crypto'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { countryName, flagEmoji } from '@/lib/countries'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { initials } from '@/lib/utils'
import { AcceptInvite } from '../../_components/accept-invite'

export const metadata: Metadata = { title: 'Team invite', robots: { index: false } }

const MAX_AVATARS = 5

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireUser()
  const { token } = await params
  const invite = await prisma.projectInvite.findUnique({
    where: { tokenHash: crypto.createHash('sha256').update(token).digest('hex') },
    include: {
      project: {
        include: {
          currentVersion: { select: { name: true, shortDescription: true, logoUrl: true, coverUrl: true, maturity: true, country: true, categories: true, otherCategory: true } },
          members: { select: { id: true, user: { select: { name: true, image: true } } }, orderBy: { createdAt: 'asc' } },
        },
      },
      invitedBy: { select: { name: true } },
    },
  })
  const usable = invite && !invite.revokedAt && !invite.acceptedAt && invite.expiresAt > new Date()
  if (!usable) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <h1 className="text-2xl">This invite can&apos;t be used</h1>
        <p className="mt-2 text-fg-muted">It may have expired, been revoked or already accepted. Ask the team to send a new one.</p>
      </div>
    )
  }
  const v = invite.project.currentVersion
  const maturity = v?.maturity ? PROJECT_MATURITY[v.maturity as ProjectMaturity] : undefined
  const categories = v?.categories.map((c) => (c === 'Other (Specify)' ? v.otherCategory : c)).filter(Boolean) ?? []
  const members = invite.project.members
  const names = members.map((m) => m.user.name)
  const teamLine = names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
  return (
    <div className="mx-auto max-w-lg py-6 sm:py-10">
      <section className="animate-fade-in-up overflow-hidden rounded-xl border border-line bg-surface-2 text-center">
        {v?.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- own CDN upload
          <img src={v.coverUrl} alt="" className="aspect-[3/1] w-full object-cover" />
        ) : (
          <div aria-hidden className="hero-glow aspect-[3/1] w-full"><div className="dot-grid size-full opacity-60" /></div>
        )}
        <div className="px-6 pb-8">
          {v?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- own CDN upload
            <img src={v.logoUrl} alt="" className="relative mx-auto -mt-10 size-20 rounded-2xl border border-line object-cover ring-4 ring-surface-2" />
          ) : (
            <span className="relative mx-auto -mt-10 grid size-20 place-items-center rounded-2xl border border-line bg-surface-1 text-2xl text-brand ring-4 ring-surface-2">{initials(v?.name ?? '?')}</span>
          )}
          <p className="meta mt-5">{invite.invitedBy?.name ?? 'Someone'} invited you to join</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">{v?.name}</h1>
          {v?.shortDescription && <p className="mx-auto mt-2 max-w-sm text-fg-muted">{v.shortDescription}</p>}

          {(maturity || v?.country || categories.length > 0) && (
            <ul className="mt-5 flex flex-wrap justify-center gap-2" aria-label="About the project">
              {maturity && <li><Badge variant="outline" title={maturity.hint}>{maturity.label}</Badge></li>}
              {v?.country && <li><Badge variant="outline">{flagEmoji(v.country)} {countryName(v.country)}</Badge></li>}
              {categories.map((c) => <li key={c}><Badge variant="secondary">{c}</Badge></li>)}
            </ul>
          )}

          <div className="mt-6 flex items-center justify-center gap-3 border-t border-line pt-6">
            <div className="flex -space-x-2">
              {members.slice(0, MAX_AVATARS).map((m) => (
                <Avatar key={m.id} className="size-9 border-2 border-surface-2">
                  {m.user.image && <AvatarImage src={m.user.image} alt="" />}
                  <AvatarFallback className="bg-surface-hover text-xs">{initials(m.user.name)}</AvatarFallback>
                </Avatar>
              ))}
            </div>
            <p className="text-left text-sm text-fg-muted">{teamLine}</p>
          </div>

          {invite.email !== user.email.toLowerCase() && (
            <p className="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-3 text-left text-sm">This invite is for {invite.email}. You&apos;re signed in as {user.email}.</p>
          )}
          <div className="mt-6 [&>button]:w-full"><AcceptInvite token={token} /></div>
          <p className="meta mt-3">Invite valid until {invite.expiresAt.toISOString().slice(0, 10)}</p>
        </div>
      </section>
    </div>
  )
}
