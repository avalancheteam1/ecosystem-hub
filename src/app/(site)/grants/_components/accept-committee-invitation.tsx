'use client'

import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'
import { acceptCommitteeInvitation } from '../_lib/committee-invitation-actions'

export function AcceptCommitteeInvitation({ id }: { id: string }) {
  const { pending, run } = useActionToast()
  return (
    <Button type="button" className="mt-5 min-h-11" disabled={pending}
      onClick={() => void run(() => acceptCommitteeInvitation({ id }), 'You joined the Grants Committee')}>
      {pending ? 'Joining…' : 'Accept invitation'}
    </Button>
  )
}
