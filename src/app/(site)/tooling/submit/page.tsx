import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/guards'
import { listMyToolingProjects } from '../_lib/queries'
import { closedState, listingProblems, submitBlock, TOOLING_CATEGORY, visibleRejectReason } from '../_lib/rules'
import { SubmitList, type SubmitRow } from './submit-list'

export const metadata: Metadata = { title: 'Submit to Tooling', robots: { index: false } }

export default async function SubmitToolPage() {
  const user = await requireUser()
  const projects = await listMyToolingProjects(user.id)
  const rows: SubmitRow[] = projects.flatMap(({ id, slug, currentVersion: v, toolingListing: l }) => {
    if (!v) return []
    const open = l && !l.closedAt ? l : null
    return [{
      projectId: id,
      slug,
      name: v.name,
      versionNumber: v.number,
      listed: open?.approvedVersion?.number ?? null,
      pending: open?.pendingVersion?.number ?? null,
      closed: l ? closedState(l) : null,
      rejected: open?.rejectedAt ? { reason: visibleRejectReason(open) } : null,
      problems: listingProblems(v),
      blocked: submitBlock(l, v.id),
      update: !!open?.approvedVersionId,
    }]
  })
  return (
    <div className="container-page max-w-3xl py-10 sm:py-16">
      <BackLink href="/tooling">Tooling</BackLink>
      <h1 className="mt-6 text-3xl sm:text-4xl">Submit to Tooling</h1>
      <p className="mt-3 text-fg-muted">
        Projects in the “{TOOLING_CATEGORY}” category that are live can be listed on /tooling. team1 reviews each submission; only the version they approve is shown, with your project’s name, logo, descriptions and links (not your team).
      </p>
      <div className="mt-10">
        {rows.length ? (
          <SubmitList rows={rows} />
        ) : (
          <EmptyState title="No projects yet" action={<Button asChild><Link href="/projects/new"><Plus aria-hidden /> New project</Link></Button>}>
            Create a hub project for your tool first. Projects you own or can edit show up here.
          </EmptyState>
        )}
      </div>
    </div>
  )
}
