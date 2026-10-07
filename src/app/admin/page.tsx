import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { requireUser } from '@/lib/guards'
import { ADMIN_NAV } from './_lib/nav'

export default async function AdminHome() {
  const user = await requireUser()
  const items = ADMIN_NAV.filter((i) => i.href !== '/admin' && i.show(user))
  return (
    <>
      <PageHeader title="Admin" description="Everything you have access to." />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
              <Icon className="size-5 text-brand" aria-hidden /> {label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
