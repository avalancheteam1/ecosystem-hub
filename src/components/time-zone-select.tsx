'use client'

import { useSyncExternalStore } from 'react'
import { SearchSelect, type SearchSelectOption } from '@/components/search-select'
import { canonicalTimeZone, listTimeZones } from '@/lib/timezones'

// Built once per page load (~420 zones). ponytail: offsets are frozen at first use, so a tab left open
// across a DST switch shows stale labels until reload - fine for a picker label; key by date if it matters.
let cached: SearchSelectOption[] | undefined
const getZones = () => (cached ??= listTimeZones().map((z) => ({ value: z.id, label: z.label })))
const subscribe = () => () => {}

/**
 * Every IANA timezone (UTC first), labelled with its current offset.
 * The option list is built in the browser only - server and browser ICU data
 * differ, which would break hydration - so the server render shows just `value`.
 */
export function TimeZoneSelect({ id, value, onChange, className }: { id: string; value: string; onChange: (tz: string) => void; className?: string }) {
  const zones = useSyncExternalStore(subscribe, getZones, () => null)
  const current = canonicalTimeZone(value)
  return <SearchSelect id={id} value={current} onChange={onChange} options={zones ?? [{ value: current, label: current }]} searchPlaceholder="Search time zones…" className={className} />
}
