import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { SearchForm } from '@/components/layout/search-form'
import { requirePermission } from '@/lib/guards'
import { listApplications } from '@/app/(site)/grants/_lib/queries'
import { ApplicationList } from '@/app/(site)/grants/_components/application-list'
import { OperationsNav } from '@/app/(site)/grants/_components/navigation'

export const metadata: Metadata = { title: 'Grant review' }
export default async function GrantReview({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission('grants.review')
  const { q } = await searchParams,
    rows = await listApplications(true, q)
  return (
    <>
      <PageHeader title="Grant review" description="Evidence, decisions and the next useful action." />
      <OperationsNav active="Applications" />
      <SearchForm q={q} placeholder="Search project" />
      <ApplicationList rows={rows} staff />
    </>
  )
}
