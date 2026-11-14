'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { deleteEvent, refreshEvent, setEventStatus } from '@/app/(site)/events/_lib/actions'
import { ConfirmButton } from '@/components/confirm-button'
import { Button } from '@/components/ui/button'

export function EventActions({ id, status, canPublish, canDelete, isPortal }: { id: string; status: string; canPublish: boolean; canDelete: boolean; isPortal: boolean }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn()
      if (res.ok) toast.success(msg)
      else toast.error(res.error ?? 'Something went wrong')
    })
  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'published' && canPublish && (
        <Button disabled={pending} title="Listed publicly: /events, home page, sitemap and search engines" onClick={() => run(() => setEventStatus({ id, status: 'published' }), 'Event published')}>Publish</Button>
      )}
      {status !== 'unlisted' && (
        <Button variant="outline" disabled={pending} title="Reachable by link only - not listed, not in search" onClick={() => run(() => setEventStatus({ id, status: 'unlisted' }), 'Event unlisted - reachable by link only')}>Unlist</Button>
      )}
      {(status === 'published' || status === 'unlisted') && (
        <Button variant="outline" disabled={pending} title="Back to draft - the public page returns 404" onClick={() => run(() => setEventStatus({ id, status: 'draft' }), 'Event unpublished')}>Unpublish</Button>
      )}
      <Button variant="outline" disabled={pending} title="Re-fetch name, dates, cover and description from the source now" onClick={() => run(() => refreshEvent({ id }), 'Refreshed')}>
        <RefreshCw className={pending ? 'animate-spin' : undefined} aria-hidden /> Refresh
      </Button>
      {status !== 'archived' && (
        <Button variant="ghost" disabled={pending} title="Hidden like a draft and no longer refreshed - keeps the event for the record" onClick={() => run(() => setEventStatus({ id, status: 'archived' }), 'Event archived')}>Archive</Button>
      )}
      {canDelete && (
        <ConfirmButton
          size="default"
          disabled={pending}
          title="Remove the event from the hub for good (Luma is not touched)"
          message={isPortal ? 'Delete this event? Public member-portal events are re-imported (published) within the hour - archive it instead to hide it for good.' : 'Delete this event? This can’t be undone.'}
          onConfirm={() => start(async () => {
            const res = await deleteEvent({ id })
            if (!res.ok) return void toast.error(res.error)
            toast.success('Event deleted')
            router.push('/admin/events')
          })}
        >
          Delete
        </ConfirmButton>
      )}
    </div>
  )
}
