import { requirePermission } from '@/lib/guards'
import { readApplication, readPayoutDestination } from '@/app/(site)/grants/_lib/queries'
import { GrantCaseView } from '@/app/(site)/grants/_components/case-view'

export default async function ReviewerGrant({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; day?: string }>
}) {
  await requirePermission('grants.review')
  const [{ id }, query] = await Promise.all([params, searchParams])
  const data = await readApplication(id, true)
  const payout = data.staff && data.capabilities.payments && query.tab === 'Payments' ? await readPayoutDestination(id, true) : null
  return <GrantCaseView data={data} requestedTab={query.tab} checkpoint={query.day} payout={payout} />
}
