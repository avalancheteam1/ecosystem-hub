import type { Metadata } from 'next'
import { requireUser } from '@/lib/guards'
import { readApplication } from '../../_lib/queries'
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
  return <GrantCaseView data={data} requestedTab={query.tab} checkpoint={query.day} />
}
