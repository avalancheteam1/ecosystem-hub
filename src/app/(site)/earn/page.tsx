import type { Metadata } from 'next'
import Link from 'next/link'
import { Code2 } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Field } from '@/components/field'
import { Pager } from '@/components/layout/pager'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { getCurrentUser } from '@/lib/session'
import { formatShortDate } from '@/lib/dates'
import { canonical } from '@/lib/metadata'
import { listPublicBounties } from './_lib/queries'
import { earnCatalogFilters } from './_lib/rules'
import { EarnDirectoryHeader } from './_components/earn-directory-header'

export const metadata: Metadata = {
  title: 'Earn',
  description: 'Find public team1 bounties to contribute to the Avalanche ecosystem.',
  ...canonical('/earn', { title: 'Earn · team1 Ecosystem Hub', description: 'Find public team1 bounties to contribute to the Avalanche ecosystem.' }),
}

export default async function EarnPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { page, ...filters } = earnCatalogFilters(await searchParams)
  const now = new Date()
  const [{ rows, hasMore }, user] = await Promise.all([listPublicBounties({ ...filters, page }, now), getCurrentUser()])

  return (
    <div className="container-page py-10 sm:py-14">
      <EarnDirectoryHeader current="/earn" signedIn={!!user} />
      <form id="earn-reset-filters" action="/earn" method="get" />
      <form action="/earn" role="search" aria-label="Filter bounties" className="mb-8 grid items-end gap-4 rounded-xl border border-line bg-surface-1 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field id="earn-search" label="Search bounties" className="sm:col-span-2">
          <Input id="earn-search" name="q" defaultValue={filters.q} placeholder="Title or Hub module" maxLength={120} className="h-11 bg-surface-2" />
        </Field>
        <Field id="earn-type" label="Bounty type">
          <NativeSelect id="earn-type" name="type" defaultValue={filters.type} className="w-full bg-surface-2">
            <option value="all">All types</option>
            <option value="standard">Standard</option>
            <option value="feature">Hub feature</option>
          </NativeSelect>
        </Field>
        <Field id="earn-status" label="Status">
          <NativeSelect id="earn-status" name="status" defaultValue={filters.status} className="w-full bg-surface-2">
            <option value="open">Accepting submissions</option>
            <option value="closed">Submissions closed</option>
            <option value="announced">Results announced</option>
            <option value="all">All statuses</option>
          </NativeSelect>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" className="min-h-11">Apply filters</Button>
          <Button type="submit" form="earn-reset-filters" variant="outline" className="min-h-11">Reset</Button>
        </div>
      </form>
      {rows.length ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((bounty) => (
            <li key={bounty.id} className="flex min-w-0 flex-col rounded-xl border border-line bg-surface-2 p-6">
              <div className="mb-3 flex flex-wrap gap-2">
                <StatusPill tone={bounty.deadline > now ? 'success' : 'neutral'}>{bounty.resultsAnnouncedAt ? 'Results announced' : bounty.deadline > now ? 'Accepting submissions' : 'Submissions closed'}</StatusPill>
                {bounty.hubModule && <StatusPill tone="info"><Code2 className="mr-1 size-3" aria-hidden /> Hub feature</StatusPill>}
              </div>
              <p className="text-sm text-fg-muted">{bounty.category}</p>
              <h2 className="mb-4 break-words text-xl">
                <Link href={`/earn/${bounty.id}`} className="inline-flex min-h-11 items-center hover:text-brand">{bounty.title}</Link>
              </h2>
              {bounty.hubModule && <p className="mb-4 break-words text-sm text-fg-body">{bounty.hubModule}</p>}
              <dl className="mt-auto flex justify-between gap-4 border-t border-line pt-4">
                <div className="min-w-0"><dt className="text-sm text-fg-muted">Reward</dt><dd className="break-words text-fg-heading">{bounty.reward}</dd></div>
                <div className="shrink-0 text-right"><dt className="text-sm text-fg-muted">Deadline</dt><dd><time dateTime={bounty.deadline.toISOString()}>{formatShortDate(bounty.deadline, 'UTC', now)} UTC</time></dd></div>
              </dl>
            </li>
          ))}
        </ul>
      ) : <EmptyState title="No bounties match these filters">Check all statuses or try a different search.</EmptyState>}
      <div className="[&_a]:min-h-11"><Pager page={page} hasMore={hasMore} params={filters} /></div>
    </div>
  )
}
