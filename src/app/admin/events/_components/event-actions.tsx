'use client'

import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { refreshEvent, setEventStatus } from '@/app/(site)/events/_lib/actions'
import { Button } from '@/components/ui/button'

export function EventActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn()
      if (res.ok) toast.success(msg)
      else toast.error(res.error ?? 'Something went wrong')
    })
  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'published' && (
        <Button disabled={pending} onClick={() => run(() => setEventStatus({ id, status: 'published' }), 'Event published')}>Publish</Button>
      )}
      {status === 'published' && (
        <Button variant="outline" disabled={pending} onClick={() => run(() => setEventStatus({ id, status: 'draft' }), 'Event unpublished')}>Unpublish</Button>
      )}
      <Button variant="outline" disabled={pending} onClick={() => run(() => refreshEvent({ id }), 'Refreshed from Luma')}>
        <RefreshCw className={pending ? 'animate-spin' : undefined} aria-hidden /> Refresh from Luma
      </Button>
      {status !== 'archived' && (
        <Button variant="ghost" disabled={pending} onClick={() => run(() => setEventStatus({ id, status: 'archived' }), 'Event archived')}>Archive</Button>
      )}
    </div>
  )
}
