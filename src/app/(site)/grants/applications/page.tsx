import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { SearchForm } from '@/components/layout/search-form'
import { buttonVariants } from '@/components/ui/button'
import { listApplications } from '../_lib/queries'
import { DiscoveryNav } from '../_components/navigation'
import { ApplicationList } from '../_components/application-list'

export const metadata: Metadata = { title: 'My grant applications', robots: { index: false } }
export default async function MyApplications({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams,
    rows = await listApplications(false, q)
  return (
    <div className="container-page py-10">
      <PageHeader title="My applications" description="Your applications, updates and next steps.">
        <Link className={buttonVariants()} href="/grants/mini-grants/apply">
          New application
        </Link>
      </PageHeader>
      <DiscoveryNav active="My applications" />
      <SearchForm q={q} placeholder="Search your project" />
      <ApplicationList rows={rows} staff={false} />
    </div>
  )
}
