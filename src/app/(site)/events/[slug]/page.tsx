import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarDays, ExternalLink, MapPin } from 'lucide-react'
import { EventCover } from '@/components/event-cover'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { formatEventRange } from '@/lib/dates'
import { getCurrentUser } from '@/lib/session'
import { HackathonView } from '../_components/hackathon/hackathon-view'
import { getMySubmission, getPublicHackathon } from '../_lib/hackathons/queries'
import { getPublicEvent } from '../_lib/queries'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getPublicEvent((await params).slug)
  if (!event) return {}
  return {
    title: event.name,
    description: event.descriptionMd?.replace(/[#*_`>\[\]()-]/g, '').slice(0, 160),
    openGraph: event.coverUrl ? { images: [event.coverUrl] } : undefined,
  }
}

export default async function EventPage({ params }: Props) {
  const event = await getPublicEvent((await params).slug)
  if (!event) notFound()
  const user = await getCurrentUser()
  const hackathon = await getPublicHackathon(event.id, user?.id ?? null)
  if (hackathon) {
    const mine = user && hackathon.joined ? await getMySubmission(hackathon.id, user.id) : null
    return <HackathonView event={event} h={hackathon} signedIn={!!user} mine={mine} />
  }
  const ended = (event.endAt ?? event.startAt) < new Date()
  return (
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
          {!ended && (
            <Button asChild size="lg" className="mt-8">
              <a href={event.lumaUrl} target="_blank" rel="noreferrer">
                Register on Luma <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
          {event.descriptionMd && (
            <section className="mt-12 border-t border-line pt-10">
              <h2 className="sr-only">About this event</h2>
              <Markdown>{event.descriptionMd}</Markdown>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
