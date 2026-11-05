import type { Metadata } from 'next'
import { AdminNavLink } from '@/components/layout/admin-nav-link'
import { SiteHeader } from '@/components/layout/site-header'
import { envProblems } from '@/lib/env'
import { denyAccess, requireUser } from '@/lib/guards'
import { holdsAny } from '@/lib/permissions'
import { ADMIN_NAV } from './_lib/nav'

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin · team1 Ecosystem Hub' }, robots: { index: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (!holdsAny(user)) denyAccess(user)
  const items = ADMIN_NAV.filter((i) => i.show(user))
  // Variable names only, never values.
  const envIssues = user.isSuperAdmin ? envProblems(process.env) : []
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="container-page flex flex-1 flex-col gap-6 py-6 lg:flex-row lg:gap-10 lg:py-10">
        <nav aria-label="Admin" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible">
          {items.map(({ href, label, icon: Icon }) => (
            <AdminNavLink key={href} href={href}>
              <Icon aria-hidden /> {label}
            </AdminNavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1">
          {envIssues.length > 0 && (
            <div role="status" className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <p className="text-fg-heading">Server environment needs attention (only super admins see this):</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">{envIssues.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
