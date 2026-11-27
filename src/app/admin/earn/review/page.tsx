import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { Field } from '@/components/field'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { requirePermission } from '@/lib/guards'
import { pageParam, textParam } from '@/lib/params'
import { bountyIdSchema } from '@/app/(site)/earn/_lib/schemas'
import { submissionLabels } from '@/app/(site)/earn/_lib/stage-rules'
import { listReviewQueue } from '@/app/(site)/earn/_lib/workflow-queries'

export const metadata: Metadata = { title: 'Earn review queue' }

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('earn.review')
  const input = await searchParams
  const page = pageParam(input.page)
  const id = bountyIdSchema.safeParse(textParam(input.bounty))
  const bountyId = id.success ? id.data : undefined
  const requestedStatus = textParam(input.status)
  const status = Object.keys(submissionLabels).find((item) => item === requestedStatus) as keyof typeof submissionLabels | undefined
  const { rows, hasMore } = await listReviewQueue(page, status, bountyId)
  return (
    <>
      <PageHeader title="Earn review queue" description="Review work for a specific submission revision." />
      <form action="/admin/earn/review" className="mb-5 flex flex-wrap items-end gap-3">
        {bountyId && <input type="hidden" name="bounty" value={bountyId} />}
        <Field id="earn-review-status" label="Status">
          <NativeSelect id="earn-review-status" name="status" defaultValue={status ?? ''}>
            <option value="">Open reviews</option>
            <option value="changes_requested">Changes requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </NativeSelect>
        </Field>
        <Button type="submit" variant="outline">Apply filter</Button>
        {bountyId && <Button asChild variant="outline"><Link href="/admin/earn/review">All bounties</Link></Button>}
      </form>
      {rows.length ? <SectionCard title="Submissions"><ul className="divide-y divide-line">
        {rows.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <Link href={`/admin/earn/review/${entry.id}`} className="inline-flex min-h-11 items-center break-words font-medium underline underline-offset-4">{entry.contributor.name} · revision {entry.revision}</Link>
            <p className="break-words text-sm text-fg-muted">{entry.stage.bounty.title} · {entry.stage.title}</p>
          </div>
          <StatusPill>{submissionLabels[entry.status]}</StatusPill>
        </li>)}
      </ul></SectionCard> : <EmptyState title="No submissions on this page">New and revised work appears in Open reviews.</EmptyState>}
      <Pager page={page} hasMore={hasMore} params={{ status, bounty: bountyId }} />
    </>
  )
}
