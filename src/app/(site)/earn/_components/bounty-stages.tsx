import Link from 'next/link'
import { ArrowRight, Check, LockKeyhole } from 'lucide-react'
import { Pager } from '@/components/layout/pager'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/session'
import { getContributorProgress } from '../_lib/workflow-queries'
import { contributorStatus, newSubmissionError, previousStageError, type StageGate } from '../_lib/stage-rules'
import { SubmissionForm } from './submission-form'

type Stage = StageGate & { deliverables: string; requiresPullRequest: boolean }

export async function BountyStages({ id, stages, active, page, open, resultsAnnounced, instructions, terms, termsVersion }: {
  id: string; stages: Stage[]; active?: string; page: number; open: boolean; resultsAnnounced: boolean; instructions: string; terms: string; termsVersion: number
}) {
  const user = await getCurrentUser()
  const stage = stages.find((item) => item.id === active) ?? stages[0]
  const finalId = stages.at(-1)?.id
  const isFinal = stage.id === finalId
  const progress = user ? await getContributorProgress(id, stage.id, page) : { attempts: [], rows: [], hasMore: false }
  const blocked = open ? previousStageError(stage, stages, progress.attempts) ?? newSubmissionError(stage, isFinal, progress.attempts) : 'Submissions are closed.'
  const signIn = `/sign-in?next=${encodeURIComponent(`/earn/${id}?stage=${stage.id}`)}`

  return (
    <div className="space-y-6">
      <SectionCard title={stages.length > 1 ? 'Bounty stages' : 'Submission'}>
        <p className="mb-4 whitespace-pre-wrap break-words">{instructions}</p>
        {stages.length > 1 && <ol className="mb-5 grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))]">
          {stages.map((item) => {
            const locked = previousStageError(item, stages, progress.attempts)
            const approved = item.id !== finalId && progress.attempts.some((entry) => entry.stageId === item.id && entry.status === 'approved')
            const Icon = approved ? Check : locked ? LockKeyhole : ArrowRight
            return (
              <li key={item.id} className="min-w-0">
                <Link href={`?stage=${item.id}`} aria-current={item.id === stage.id ? 'step' : undefined} className={`flex h-full min-h-11 flex-col gap-2 rounded-lg border p-4 text-fg-body ${item.id === stage.id ? 'border-brand bg-surface-2' : 'border-line bg-surface-1 hover:border-brand'}`}>
                  <span className="flex justify-between gap-2 text-sm">Stage {item.position}{item.id === finalId ? ' · Final' : ''}<Icon className="size-4" aria-hidden /></span>
                  <span className="break-words font-medium text-fg-heading">{item.title}</span>
                  {item.requiresPullRequest && <span className="text-sm">GitHub PR</span>}
                  {(approved || locked) && <span className="text-sm">{approved ? 'Approved' : 'Approval required'}</span>}
                </Link>
              </li>
            )
          })}
        </ol>}
        <h3 className="mb-2 text-lg">{stage.title}</h3>
        {stage.deliverables && <p className="whitespace-pre-wrap break-words">{stage.deliverables}</p>}
        {blocked && <p className="mt-3 text-sm text-fg-body">{blocked}</p>}
        {open && !user && <Button asChild className="mt-4"><Link href={signIn}>Sign in to contribute</Link></Button>}
      </SectionCard>
      {progress.rows.length > 0 && <SectionCard title="Your receipts">
        <ul className="divide-y divide-line">
          {progress.rows.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <Link href={`/earn/${id}/receipts/${entry.id}`} className="inline-flex min-h-11 items-center underline underline-offset-4">Receipt · {entry.id.slice(0, 8)} · revision {entry.revision}</Link>
              <StatusPill>{contributorStatus(entry.status, { final: isFinal, announced: resultsAnnounced, awarded: !!entry.award, cancelled: false })}</StatusPill>
            </li>
          ))}
        </ul>
        <Pager page={page} hasMore={progress.hasMore} params={{ stage: stage.id }} />
      </SectionCard>}
      {!progress.rows.length && page > 1 && <Pager page={page} hasMore={false} params={{ stage: stage.id }} />}
      {user && !blocked && <SectionCard title="Submit stage work">
        <SubmissionForm key={stage.id} bountyId={id} stageId={stage.id} requiresPullRequest={stage.requiresPullRequest} terms={terms} termsVersion={termsVersion} />
      </SectionCard>}
    </div>
  )
}
