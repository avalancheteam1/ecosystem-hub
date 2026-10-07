import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Prev/next links preserving other query params. */
export function Pager({ page, hasMore, params }: { page: number; hasMore: boolean; params: Record<string, string | undefined> }) {
  if (page === 1 && !hasMore) return null
  const href = (p: number) => '?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), page: String(p) } as Record<string, string>)
  return (
    <div className="mt-4 flex justify-end gap-2">
      {page > 1 && <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}>Previous</Link></Button>}
      {hasMore && <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Next</Link></Button>}
    </div>
  )
}
