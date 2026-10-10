import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { EventCover } from '@/components/event-cover'
import { Button } from '@/components/ui/button'
import { prisma } from '@/lib/db'
import { formatEventRange, formatShortDate } from '@/lib/dates'
import { requireUser } from '@/lib/guards'
import { hasCompleteBasicProfile } from '@/lib/profile'
import { cn } from '@/lib/utils'
import { getPublicHackathon } from '../../_lib/hackathons/queries'
import { getPublicEvent } from '../../_lib/queries'
import { JoinForm } from './join-form'

export const metadata: Metadata = { title: 'Register', robots: { index: false } }

function EventLink({ slug, name }: { slug: string; name: string }) {
  return (
    <Link href={`/events/${slug}`} className="group inline-flex min-h-11 items-center gap-2 text-fg-muted hover:text-fg-heading">
      <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden /> {name}
    </Link>
  )
}

export default async function JoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { slug } = await params
  const { invite } = await searchParams
  const user = await requireUser()
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const h = await getPublicHackathon(event.id, user.id)
  if (!h) notFound()
  // Only to pick the copy - joinHackathon re-checks the invite.
  const invited = typeof invite === 'string' && (await prisma.hackathon.count({ where: { id: h.id, inviteToken: invite } })) > 0
  if (h.joined || h.registration === 'pending' || (h.registration === 'rejected' && !invited)) redirect(`/events/${slug}`)
  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, country: true, builderRoles: true } })
  if (!hasCompleteBasicProfile(profile)) {
    return (
      <div className="container-page max-w-xl py-20 text-center">
        <EventLink slug={slug} name={event.name} />
        <h1 className="mt-6 text-3xl">One step before you register</h1>
        <p className="mt-3 text-fg-muted">Add your country and what roles describe you, so organisers know who&apos;s building.</p>
        <Button asChild size="lg" className="mt-8"><Link href={`/profile?next=${encodeURIComponent(`/events/${slug}/join${invited ? `?invite=${invite}` : ''}`)}`}>Complete your profile</Link></Button>
      </div>
    )
  }

  const needsApproval = h.requireApproval && !invited
  const now = new Date()
  const firstStage = h.stages.find((s) => s.closesAt > now)
  const location = event.isOnline ? 'Online' : [event.city, event.country].filter(Boolean).join(', ')
  const teamSize = h.teamSizeMax == null ? `${h.teamSizeMin}+ people` : h.teamSizeMin === h.teamSizeMax ? `${h.teamSizeMin} ${h.teamSizeMin === 1 ? 'person' : 'people'}` : `${h.teamSizeMin}–${h.teamSizeMax} people`
  const facts = [
    ['When', formatEventRange(event.startAt, event.endAt, event.timezone)],
    ...(location ? [['Where', location]] : []),
    ...(h.prizePool ? [['Prize pool', h.prizePool]] : []),
    ['Team size', teamSize],
    ...(h.registrationClosesAt ? [['Registration closes', formatShortDate(h.registrationClosesAt, h.timezone)]] : []),
  ]
  const steps = [
    ['Register', 'Answer a few questions and you’re on the list.'],
    ...(needsApproval ? [['Get approved', 'The organisers review every registration - we’ll email you once you’re in.']] : []),
    ['Form your team', 'Teams form around projects - create one or get invited to a teammate’s.'],
    ['Submit', firstStage ? `Submit your project to ${firstStage.name} by ${formatShortDate(firstStage.closesAt, h.timezone)}.` : 'Submit your project when the first stage opens.'],
  ]

  return (
    <div className="container-page py-10 sm:py-14">
      <EventLink slug={slug} name={event.name} />
      <h1 className="mt-4 text-3xl sm:text-5xl">Register for Hackathon</h1>
      {h.tagline && <p className="mt-3 max-w-[60ch] text-lg text-fg-body">{h.tagline}</p>}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
          <p className="text-sm text-fg-muted">Registering as <span className="text-fg-heading">{user.name}</span> ({user.email})</p>
          <div className="mt-6 border-t border-line pt-8">
            <JoinForm hackathonId={h.id} fields={h.fields} termsUrl={h.termsUrl} invite={invited ? invite : undefined} needsApproval={needsApproval} />
          </div>
        </div>

        <aside className="grid gap-8 lg:sticky lg:top-24">
          <div className="flex items-center gap-4">
            <EventCover src={event.coverUrl} className="size-20 shrink-0" />
            <p className="font-heading text-lg leading-tight text-fg-heading">{event.name}</p>
          </div>
          <dl className="grid gap-3 border-t border-line pt-6 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-fg-muted">{label}</dt>
                <dd className="text-right text-fg-heading">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-line pt-6">
            <h2 className="meta">What happens next</h2>
            <ol className="mt-4 grid gap-4">
              {steps.map(([title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-full border text-xs tabular-nums', i === 0 ? 'border-brand text-fg-heading' : 'border-line text-fg-muted')}>{i + 1}</span>
                  <div>
                    <p className="text-fg-heading">{title}</p>
                    <p className="text-sm text-fg-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}
