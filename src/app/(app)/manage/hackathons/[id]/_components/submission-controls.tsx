'use client'

import { setSubmissionStatus } from '@/app/(site)/events/_lib/hackathons/judging-actions'
import { ConfirmButton } from '@/components/confirm-button'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'

export function SubmissionStatusButton({ hackathonId, submissionId, status }: { hackathonId: string; submissionId: string; status: string }) {
  const { pending, run } = useActionToast()
  if (status === 'withdrawn') return null
  return status === 'disqualified' ? (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setSubmissionStatus({ hackathonId, submissionId, status: 'active' }), 'Reinstated')}>Reinstate</Button>
  ) : (
    <ConfirmButton disabled={pending} message="Disqualify this submission? It drops out of judging and awards." onConfirm={() => run(() => setSubmissionStatus({ hackathonId, submissionId, status: 'disqualified' }), 'Disqualified')}>Disqualify</ConfirmButton>
  )
}
