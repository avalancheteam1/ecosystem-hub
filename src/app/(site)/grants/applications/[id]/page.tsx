import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/section-card'
import { requireUser } from '@/lib/guards'
import { readApplication, readReapplicationNotice } from '../../_lib/queries'
import { formatReapplicationDate, priorDecisionUnverified } from '../../_lib/reapplication'
import { GrantCaseView } from '../../_components/case-view'

export const metadata: Metadata = { title: 'Grant application', robots: { index: false } }
export default async function ApplicantGrant({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; day?: string }>
}) {
  await requireUser()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const data = await readApplication(id, false)
  const declined = data.state.status === 'not_selected'
  const notice = declined || (data.continuous && data.state.status === 'draft')
    ? await readReapplicationNotice(data.projectId, id)
    : null
  const date = notice?.eligibility?.eligibleAt
  const canStart = declined && notice?.canStart && !notice.unverified && !notice.award &&
    !notice.otherActiveId && notice.eligibility && !notice.eligibility.waiting
  return (
    <>
      {notice && (
        <aside className="container-page pt-8" aria-label="Reapplication">
          <SectionCard className="space-y-2">
            <p className="font-medium text-fg-heading">Reapplication</p>
            {notice.unverified ? <p className="text-sm text-fg-body">{priorDecisionUnverified}</p> : date && (
              <p className="text-sm text-fg-body">
                Earliest reapplication date <time className="font-medium" dateTime={date.toISOString()}>{formatReapplicationDate(date)}</time>.
              </p>
            )}
            {notice.award ? <p className="text-sm text-fg-body">This project already has a grant award.</p> : (
              <p className="text-sm text-fg-body">
                To reapply, add a different working demo or select a different roadmap milestone with a substantially different deliverable and verification criterion. The Grants Committee reviews the new application.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4">
              {canStart && (
                <Button asChild>
                  <Link href={{ pathname: '/grants/mini-grants/apply', query: { project: data.projectId } }}>Start reapplication</Link>
                </Button>
              )}
              {!notice.award && notice.canStart && !notice.otherActiveId && (
                <Link href={`/projects/${data.projectSlug}/edit`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Edit project</Link>
              )}
              {notice.otherActiveId && (
                <Link href={`/grants/applications/${notice.otherActiveId}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Open current application</Link>
              )}
              {notice.previousId && notice.previousId !== id && (
                <Link href={`/grants/applications/${notice.previousId}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">View latest decline</Link>
              )}
            </div>
          </SectionCard>
        </aside>
      )}
      <GrantCaseView data={data} requestedTab={query.tab} checkpoint={query.day} />
    </>
  )
}
