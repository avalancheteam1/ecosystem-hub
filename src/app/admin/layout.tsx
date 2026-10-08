import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AdminNavLink } from '@/components/layout/admin-nav-link'
import { SiteHeader } from '@/components/layout/site-header'
import { requireUser } from '@/lib/guards'
import { holdsAny } from '@/lib/permissions'
import { ADMIN_NAV } from './_lib/nav'

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin · team1 Ecosystem Hub' }, robots: { index: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (!holdsAny(user)) notFound()
  const items = ADMIN_NAV.filter((i) => i.show(user))
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
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
