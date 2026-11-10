import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { getManagedHackathon } from '@/app/(site)/events/_lib/hackathons/queries'
import { isReachable } from '@/app/(site)/events/_lib/status'
import { EventCover } from '@/components/event-cover'
import { Badge } from '@/components/ui/badge'
import { formatEventRange } from '@/lib/dates'
import { requireUser } from '@/lib/guards'
import { ManageTabs } from './_components/manage-tabs'
import { PublishButton } from './_components/publish-button'

export const metadata: Metadata = { title: { default: 'Hackathon', template: '%s · Hackathon · team1 Ecosystem Hub' }, robots: { index: false } }

export default async function ManageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const h = await getManagedHackathon(id, user)
  if (!h) notFound()
  return (
    <div>
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center">
        <EventCover src={h.event.coverUrl} className="size-20 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`rounded-full border-0 ${h.status === 'published' ? 'bg-success/15 text-success' : 'bg-surface-hover text-fg-muted'}`}>{h.status === 'published' ? 'Live' : 'Draft'}</Badge>
            <span className="text-sm text-fg-muted">{h._count.participants} joined - {h._count.submissions} submissions</span>
          </div>
          <h1 className="mt-1 text-2xl text-balance sm:text-3xl">{h.event.name}</h1>
          <p className="text-sm text-fg-muted">{formatEventRange(h.event.startAt, h.event.endAt, h.event.timezone)}</p>
        </div>
        <div className="flex items-center gap-3">
          {isReachable(h.event.status) && (
            <Link href={`/events/${h.event.slug}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-muted hover:text-fg-heading">
              Public page <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          )}
          <PublishButton hackathonId={h.id} status={h.status} />
        </div>
      </header>
      <ManageTabs base={`/manage/hackathons/${h.id}`} />
      {children}
    </div>
  )
}
