import type { Metadata } from 'next'
import Link from 'next/link'
import { SectionCard } from '@/components/section-card'
import { SearchForm } from '@/components/layout/search-form'
import { buttonVariants } from '@/components/ui/button'
import { listApplications } from '../_lib/queries'
import { ApplicationList } from '../_components/application-list'

export const metadata: Metadata = { title: 'My grant applications', robots: { index: false } }
export default async function MyApplications({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams,
    rows = await listApplications(false, q)
  return (
    <SectionCard title="My applications" description="Your applications, updates and next steps." actions={
        <Link className={buttonVariants()} href="/grants/mini-grants/apply">
          New application
        </Link>
    }>
      <SearchForm q={q} placeholder="Search your project" />
      <ApplicationList rows={rows} staff={false} />
    </SectionCard>
  )
}
