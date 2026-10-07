import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

/** Plain GET search form — the page reads `?q=` server-side. */
export function SearchForm({ q, placeholder }: { q?: string; placeholder: string }) {
  return (
    <form role="search" className="relative mb-4 max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
      <Input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} className="h-11 pl-9" />
    </form>
  )
}
