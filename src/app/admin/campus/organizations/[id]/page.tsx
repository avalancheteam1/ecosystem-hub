import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { CAMPUS_ORG_TYPES } from '@/lib/campus'
import { countryName } from '@/lib/countries'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/guards'
import { can } from '@/lib/permissions'
import { OrgActions } from '../../_components/org-actions'

export const metadata: Metadata = { title: 'University' }

export default async function CampusOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('campus.manage')
  const { id } = await params
  const org = await prisma.organization.findUnique({
    where: { id, type: { in: [...CAMPUS_ORG_TYPES] } },
    include: { parent: { select: { id: true, name: true } }, children: { where: { type: 'blockchain_club' }, orderBy: { name: 'asc' }, select: { id: true, name: true, hidden: true } }, createdBy: { select: { name: true } }, _count: { select: { members: true, clubMembers: true } } },
  })
  if (!org) notFound()
  // ponytail: every same-type entry as merge target - fine for a few thousand
  const targets = await prisma.organization.findMany({
    where: { type: org.type, id: { not: org.id }, ...(org.type === 'blockchain_club' ? { parentId: org.parentId } : {}), ...(org.rorId ? { rorId: null } : {}) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, aliases: true, country: true, rorId: true },
  })
  const members = org._count.members + org._count.clubMembers
  return (
    <>
      <BackLink href="/admin/campus/organizations">Universities &amp; clubs</BackLink>
      <PageHeader title={org.name} description={[org.type === 'university' ? 'University' : 'Blockchain club', countryName(org.country), org.parent?.name].filter(Boolean).join(' · ')} />
      <div className="grid gap-6">
        <SectionCard title="Status">
          <div className="mb-4 flex flex-wrap gap-2">
            {org.rorId && !org.createdBy ? null : <StatusPill tone="warning">Added by {org.createdBy?.name ?? 'a builder'} on {org.createdAt.toISOString().slice(0, 10)}</StatusPill>}
            {org.rorId && <a href={`https://ror.org/${org.rorId}`} target="_blank" rel="noopener noreferrer"><StatusPill tone="info">University list (ROR {org.rorId})</StatusPill></a>}
            {org.verified && <StatusPill tone="success">Verified</StatusPill>}
            {org.hidden && <StatusPill>Hidden from pickers</StatusPill>}
          </div>
          {org.aliases.length > 0 && <p className="mb-4 text-sm text-fg-body">Also known as: {org.aliases.join(', ')}</p>}
          <OrgActions
            org={{ id: org.id, name: org.name, aliases: org.aliases, verified: org.verified, hidden: org.hidden }}
            mergeTargets={targets.map((t) => ({ value: t.id, label: `${t.name}${t.country ? ` (${t.country})` : ''}${t.rorId ? ' · university list' : ''}`, keywords: t.aliases }))}
          />
        </SectionCard>
        <SectionCard title="Members">
          <p className="text-sm text-fg-body">
            {members} {members === 1 ? 'person' : 'people'}.{' '}
            {org.type === 'university' && can(user, 'campus.view') && members > 0 && <Link href={`/admin/campus?university=${org.id}`} className="text-brand hover:underline">See them</Link>}
          </p>
        </SectionCard>
        {org.type === 'university' && org.children.length > 0 && (
          <SectionCard title="Blockchain clubs">
            <ul className="space-y-1 text-sm">
              {org.children.map((c) => <li key={c.id}><Link href={`/admin/campus/organizations/${c.id}`} className="hover:underline">{c.name}</Link>{c.hidden && <span className="text-fg-faint"> · hidden</span>}</li>)}
            </ul>
          </SectionCard>
        )}
      </div>
    </>
  )
}
