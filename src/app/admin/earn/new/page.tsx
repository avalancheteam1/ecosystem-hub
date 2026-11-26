import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { requirePermission } from '@/lib/guards'
import { listEarnOrganizationOptions } from '@/app/(site)/earn/_lib/queries'
import { BountyForm } from '../_components/bounty-form'

export const metadata: Metadata = { title: 'New bounty' }

export default async function NewBountyPage() {
  await requirePermission('earn.publish')
  const organizations = await listEarnOrganizationOptions()
  return (
    <>
      <BackLink href="/admin/earn">Earn publishing</BackLink>
      <PageHeader title="New bounty" description="Save a private draft, then publish it when the brief is ready." />
      <BountyForm id={randomUUID()} organizations={organizations} />
    </>
  )
}
