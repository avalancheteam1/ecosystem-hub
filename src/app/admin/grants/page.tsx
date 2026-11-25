import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { pageParam, textParam } from '@/lib/params'
import { SearchForm } from '@/components/layout/search-form'
import { requirePermission } from '@/lib/guards'
import { GRANT_PAGE_SIZE, listApplications } from '@/app/(site)/grants/_lib/queries'
import { ApplicationList } from '@/app/(site)/grants/_components/application-list'
import { OperationsNav } from '@/app/(site)/grants/_components/navigation'

export const metadata: Metadata = { title: 'Grant review' }
export default async function GrantReview({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  await requirePermission('grants.review')
  const query = await searchParams
  const q = textParam(query.q)
  const page = pageParam(query.page)
  const rows = await listApplications(true, q, page)
  return (
    <>
      <PageHeader title="Grant review" description="Evidence, decisions and the next useful action." />
      <OperationsNav active="Applications" />
      <SearchForm q={q} placeholder="Search project" />
      <ApplicationList rows={rows.slice(0, GRANT_PAGE_SIZE)} staff />
      <Pager page={page} hasMore={rows.length > GRANT_PAGE_SIZE} params={{ q }} />
    </>
  )
}
