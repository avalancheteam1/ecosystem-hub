'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { runJobNow } from '../_lib/actions'

export function RunNowButton({ name }: { name: string }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await runJobNow({ name })
          if (!res.ok) return void toast.error(res.error)
          toast.success(`${name} queued - refresh in a moment`)
          setTimeout(() => router.refresh(), 2000)
        })
      }
    >
      <Play aria-hidden /> Run now
    </Button>
  )
}

export function RefreshButton() {
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => router.refresh())}>
      <RefreshCw aria-hidden className={pending ? 'animate-spin' : undefined} /> Refresh
    </Button>
  )
}
