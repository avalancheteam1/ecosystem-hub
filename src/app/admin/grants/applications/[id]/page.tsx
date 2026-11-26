import { requirePermission } from '@/lib/guards'
import { prismaDatabaseUrl } from '@/lib/db'
import { syntheticPayoutEnabled } from '@/app/(site)/grants/_lib/config'
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
  const canOpenPayout = data.staff && data.capabilities.payments && data.state.version === 4 &&
    data.state.status === 'approved' && syntheticPayoutEnabled(prismaDatabaseUrl)
  const payout = canOpenPayout && query.tab === 'Payments' ? await readPayoutDestination(id, true) : null
  return <GrantCaseView data={data} requestedTab={query.tab} checkpoint={query.day} payout={payout} canOpenPayout={canOpenPayout} />
}
