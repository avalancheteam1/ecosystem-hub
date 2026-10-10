import Link from 'next/link'
import { EventCover } from '@/components/event-cover'

/** Clickable row card with a square image (event cover) - used by list pages. */
export function LinkCard({ href, image, title, meta, metaClassName }: { href: string; image: string | null; title: string; meta: React.ReactNode; metaClassName?: string }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-xl border border-line bg-surface-2 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
      <EventCover src={image} className="size-16 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <p className="truncate text-fg-heading">{title}</p>
        <p className={`text-sm ${metaClassName ?? 'text-fg-muted'}`}>{meta}</p>
      </div>
    </Link>
  )
}
