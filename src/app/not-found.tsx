import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { NotFoundView } from '@/components/not-found-view'

// Unmatched URLs and notFound() outside a layout with a header.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1"><NotFoundView /></main>
      <SiteFooter />
    </div>
  )
}
