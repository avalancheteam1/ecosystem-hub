'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { acceptInvite } from '../_lib/actions'

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acceptInvite({ token })
          if (!res.ok) return void toast.error(res.error)
          toast.success("You're on the team")
          router.push(`/projects/${res.data.slug}`)
        })
      }
    >
      Join the team
    </Button>
  )
}
