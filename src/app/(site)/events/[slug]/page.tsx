import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarDays, ExternalLink, MapPin } from 'lucide-react'
import { EventCover } from '@/components/event-cover'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { formatEventRange } from '@/lib/dates'
import { canonical, plainText } from '@/lib/metadata'
import { ensureReferralCode } from '@/lib/referral-codes'
import { getCurrentUser } from '@/lib/session'
import { ShareDialog } from '@/components/share-dialog'
import { EventManageLinks } from '../_components/event-manage-links'
import { HackathonView } from '../_components/hackathon/hackathon-view'
import { getMySubmissions, getPublicHackathon } from '../_lib/hackathons/queries'
import { blocksPublish } from '../_lib/portal'
import { getPublicEvent } from '../_lib/queries'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getPublicEvent((await params).slug)
  if (!event) return {}
  return {
    title: event.name,
    description: (!blocksPublish(event) && plainText(event.descriptionMd ?? '')) || `${event.name} - a team1 event for builders in the Avalanche ecosystem.`,
    ...canonical(`/events/${event.slug}`, event.coverUrl ? { images: [event.coverUrl] } : undefined),
    ...(event.status === 'unlisted' && { robots: { index: false } }),
  }
}

export default async function EventPage({ params }: Props) {
  const found = await getPublicEvent((await params).slug)
  if (!found) notFound()
  // private portal event: never its address, description or (private) Luma link - city + date only
  const event = blocksPublish(found) ? { ...found, fullAddress: null, descriptionMd: null, lumaUrl: null } : found
  const user = await getCurrentUser()
  const [hackathon, refCode] = await Promise.all([getPublicHackathon(event.id, user?.id ?? null), user ? ensureReferralCode(user.id) : null])
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'
  const share = (
    <ShareDialog
      url={`${siteUrl}/events/${event.slug}${refCode ? `?ref=${refCode}` : ''}`}
      title={event.name}
      filename={`team1-${event.slug}${refCode ? `-${refCode}` : ''}`}
      referred={!!refCode}
      signedIn={!!user}
    />
  )
  if (hackathon) {
    const mine = user && hackathon.joined ? await getMySubmissions(hackathon.id, user.id) : []
    return (
      <HackathonView event={event} h={hackathon} signedIn={!!user} mine={mine} share={share} manage={<EventManageLinks eventId={event.id} user={user} />} />
    )
  }
  const ended = (event.endAt ?? event.startAt) < new Date()
  return (
    <>
      <EventManageLinks eventId={event.id} user={user} />
      <div className="container-page py-10 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <EventCover src={event.coverUrl} />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl leading-tight sm:text-5xl">{event.name}</h1>
            <dl className="mt-8 space-y-4">
              <div className="flex gap-4">
                <dt className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface-1">
                  <CalendarDays className="size-5 text-brand" aria-label="When" />
                </dt>
                <dd className="self-center text-fg-body">{formatEventRange(event.startAt, event.endAt, event.timezone)}</dd>
              </div>
              <div className="flex gap-4">
                <dt className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface-1">
                  <MapPin className="size-5 text-brand" aria-label="Where" />
                </dt>
                <dd className="self-center text-fg-body">{event.isOnline ? 'Online' : (event.fullAddress ?? event.city ?? 'See Luma for the location')}</dd>
              </div>
            </dl>
            <div className="mt-8 flex flex-wrap gap-3">
              {!ended && event.lumaUrl && (
                <Button asChild size="lg">
                  <a href={event.lumaUrl} target="_blank" rel="noreferrer">
                    Register on Luma <ExternalLink aria-hidden />
                  </a>
                </Button>
              )}
              {share}
            </div>
            {event.descriptionMd && (
              <section className="mt-12 border-t border-line pt-10">
                <h2 className="sr-only">About this event</h2>
                <Markdown>{event.descriptionMd}</Markdown>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
