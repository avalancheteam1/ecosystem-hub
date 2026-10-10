import Link from 'next/link'
import { cn } from '@/lib/utils'

/** team1 wordmark - official files from common/brand, never redrawn. Variant follows the theme. */
export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2', className)} aria-label="team1 Ecosystem Hub - home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/Team1_MAIN_WHITE.svg" alt="" className="hidden h-6 w-auto dark:block" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/Team1_BLACK_MAIN.svg" alt="" className="block h-6 w-auto dark:hidden" />
      <span className="border-l border-line pl-2 text-sm font-normal whitespace-nowrap text-fg-muted"><span className="hidden sm:inline">Ecosystem </span>Hub</span>
    </Link>
  )
}
