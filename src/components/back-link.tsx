import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted hover:text-fg-heading">
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </Link>
  )
}
