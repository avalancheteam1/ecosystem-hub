import type { Metadata } from 'next'
import Link from 'next/link'
import { SectionCard } from '@/components/section-card'
import { Pager } from '@/components/layout/pager'
import { pageParam, textParam } from '@/lib/params'
import { SearchForm } from '@/components/layout/search-form'
import { buttonVariants } from '@/components/ui/button'
import { GRANT_PAGE_SIZE, listApplications } from '../_lib/queries'
import { ApplicationList } from '../_components/application-list'

export const metadata: Metadata = { title: 'My grant applications', robots: { index: false } }
export default async function MyApplications({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  const query = await searchParams
  const q = textParam(query.q)
  const page = pageParam(query.page)
  const rows = await listApplications(false, q, page)
  return (
    <SectionCard title="My applications" description="Your applications, updates and next steps." actions={
        <Link className={buttonVariants()} href="/grants/mini-grants/apply">
          New application
        </Link>
    }>
      <SearchForm q={q} placeholder="Search your project" />
      <ApplicationList rows={rows.slice(0, GRANT_PAGE_SIZE)} staff={false} />
      <Pager page={page} hasMore={rows.length > GRANT_PAGE_SIZE} params={{ q }} />
    </SectionCard>
  )
}
