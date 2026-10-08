'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { setHackathonStatus } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { Button } from '@/components/ui/button'

export function PublishButton({ hackathonId, status }: { hackathonId: string; status: string }) {
  const [pending, start] = useTransition()
  const next = status === 'published' ? 'draft' : 'published'
  return (
    <Button
      variant={status === 'published' ? 'outline' : 'default'}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setHackathonStatus({ hackathonId, status: next })
          if (res.ok) toast.success(next === 'published' ? 'Hackathon is live' : 'Back to draft')
          else toast.error(res.error)
        })
      }
    >
      {status === 'published' ? 'Unpublish' : 'Publish'}
    </Button>
  )
}
