'use client'

import { SearchSelect } from '@/components/search-select'
import { flagEmoji } from '@/lib/countries'

/** Searchable country picker with flags. `countries` comes from the server: Intl names differ between Node and browsers (hydration). */
export function CountrySelect({ id, value, onChange, countries }: { id?: string; value: string | null | undefined; onChange: (code: string) => void; countries: { code: string; name: string }[] }) {
  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={onChange}
      placeholder="Select your country"
      searchPlaceholder="Search countries…"
      options={countries.map((c) => ({ value: c.code, label: c.name, icon: <span aria-hidden>{flagEmoji(c.code)}</span> }))}
    />
  )
}
