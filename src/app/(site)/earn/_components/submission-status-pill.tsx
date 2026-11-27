import type { ComponentProps } from 'react'
import { StatusPill } from '@/components/status-pill'
import type { contributorStatus } from '../_lib/stage-rules'

type ContributorLabel = ReturnType<typeof contributorStatus>

const tones: Partial<Record<ContributorLabel, ComponentProps<typeof StatusPill>['tone']>> = {
  'In review': 'info',
  'Changes requested': 'warning',
  Approved: 'success',
  Awarded: 'success',
}

export function SubmissionStatusPill({ label }: { label: ContributorLabel }) {
  return <StatusPill tone={tones[label] ?? 'neutral'} className="text-fg-heading">{label}</StatusPill>
}
