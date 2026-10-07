import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { requireUser } from '@/lib/guards'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container-page flex-1 py-10">{children}</main>
      <SiteFooter />
    </div>
  )
}
