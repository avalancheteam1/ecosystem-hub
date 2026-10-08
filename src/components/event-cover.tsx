import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Luma cover (square-ish, Luma's own format) with an on-brand fallback. */
export function EventCover({ src, className }: { src: string | null; className?: string }) {
  if (!src) {
    return (
      <div className={cn('grid aspect-square place-items-center rounded-xl border border-line bg-surface-1', className)}>
        <CalendarDays className="size-1/4 text-fg-faint" aria-hidden />
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element -- Luma CDN images, already sized by Luma
  return <img src={src} alt="" loading="lazy" className={cn('aspect-square w-full rounded-xl border border-line object-cover', className)} />
}
