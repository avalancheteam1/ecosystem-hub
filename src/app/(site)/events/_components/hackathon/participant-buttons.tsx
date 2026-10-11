'use client'

import { leaveHackathon } from '@/app/(site)/events/_lib/hackathons/participant-actions'
import { withdrawSubmission } from '@/app/(site)/events/_lib/hackathons/submission-actions'
import { ConfirmButton } from '@/components/confirm-button'
import { useActionToast } from '@/hooks/use-action-toast'

export function WithdrawSubmissionButton({ submissionId, name }: { submissionId: string; name: string }) {
  const { pending, run } = useActionToast()
  return (
    <ConfirmButton disabled={pending} message={`Withdraw "${name}" from this hackathon? This is final - the project can't be submitted here again.`} onConfirm={() => run(() => withdrawSubmission({ submissionId }), 'Submission withdrawn')}>
      Withdraw submission
    </ConfirmButton>
  )
}

export function LeaveHackathonButton({ hackathonId }: { hackathonId: string }) {
  const { pending, run } = useActionToast()
  return (
    <ConfirmButton disabled={pending} message="Leave this hackathon? You can register again while registration is open." onConfirm={() => run(() => leaveHackathon({ hackathonId }), 'You left the hackathon')}>
      Leave hackathon
    </ConfirmButton>
  )
}
