import type { Metadata } from 'next'
import { BackLink } from '@/components/back-link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/guards'
import { isPermission } from '@/lib/permissions'
import { isEnvSuperAdmin } from '@/lib/session'
import { ResetSecondFactorButton, SuperAdminSwitch, UserGrantsForm, UserRolesForm } from '../../_components/user-access-forms'

export const metadata: Metadata = { title: 'User access' }

export default async function UserAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSuperAdmin()
  const { id } = await params
  const [user, roles] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, emailVerified: true, isSuperAdmin: true, twoFactorEnabled: true, _count: { select: { passkeys: true } },
        roles: { select: { role: { select: { id: true, label: true, permissions: true } } } },
        permissions: { select: { permission: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { label: 'asc' }, select: { id: true, label: true, slug: true } }),
  ])
  if (!user) notFound()

  const direct = user.permissions.map((p) => p.permission).filter(isPermission)
  // Effective permissions with where each comes from.
  const sources = new Map<string, string[]>()
  for (const { role } of user.roles) for (const p of role.permissions.filter(isPermission)) sources.set(p, [...(sources.get(p) ?? []), role.label])
  const viaRoles = [...sources.keys()]
  for (const p of direct) sources.set(p, [...(sources.get(p) ?? []), 'direct'])
  const envLocked = user.emailVerified && isEnvSuperAdmin(user.email)

  return (
    <>
      <BackLink href="/admin/access">Access
      </BackLink>
      <PageHeader title={user.name} description={user.email} />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-6 rounded-xl border border-line bg-surface-2 p-6">
          <SuperAdminSwitch userId={user.id} value={user.isSuperAdmin} envLocked={envLocked} isSelf={actor.id === user.id} />
          <div>
            <h2 className="mb-1 text-lg">Sign-in step</h2>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-body">
              <span>
                {user._count.passkeys} {user._count.passkeys === 1 ? 'passkey' : 'passkeys'} · authenticator app {user.twoFactorEnabled ? 'on' : 'off'}
                {(user.isSuperAdmin || envLocked) && !user.twoFactorEnabled && user._count.passkeys === 0 && <span className="block text-xs text-warning">Super admin powers stay off until they set one up.</span>}
              </span>
              {(user.twoFactorEnabled || user._count.passkeys > 0) && <ResetSecondFactorButton userId={user.id} name={user.name} />}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-lg">Roles</h2>
            <UserRolesForm userId={user.id} roles={roles} initial={user.roles.map((r) => r.role.id)} />
          </div>
          <div>
            <h2 className="mb-3 text-lg">Effective permissions</h2>
            {user.isSuperAdmin || envLocked ? (
              <p className="text-sm text-fg-muted">Super admins hold every permission.</p>
            ) : sources.size === 0 ? (
              <p className="text-sm text-fg-muted">None.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {[...sources].map(([p, from]) => (
                  <li key={p}><code>{p}</code> <span className="text-fg-faint">via</span> {from.map((f) => <Badge key={f} variant="secondary" className="ml-1">{f}</Badge>)}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <section className="rounded-xl border border-line bg-surface-2 p-6">
          <h2 className="mb-1 text-lg">Direct permissions</h2>
          <p className="mb-4 text-sm text-fg-muted">Prefer roles; use direct grants for one-off access.</p>
          <UserGrantsForm userId={user.id} initial={direct} viaRoles={viaRoles} />
        </section>
      </div>
    </>
  )
}
