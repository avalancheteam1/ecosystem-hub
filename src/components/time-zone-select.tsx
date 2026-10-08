'use client'

import { useEffect, useState } from 'react'
import { NativeSelect } from '@/components/ui/native-select'
import { canonicalTimeZone, listTimeZones } from '@/lib/timezones'

/**
 * Every IANA timezone (UTC first), labelled with its current offset.
 * The option list is built in the browser only — server and browser ICU data
 * differ, which would break hydration — so the first render shows just `value`.
 */
export function TimeZoneSelect({ id, value, onChange, className }: { id: string; value: string; onChange: (tz: string) => void; className?: string }) {
  const [zones, setZones] = useState<{ id: string; label: string }[] | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only list (see above)
  useEffect(() => setZones(listTimeZones()), [])
  const current = canonicalTimeZone(value)
  const options = zones ?? [{ id: current, label: current }]
  return (
    <NativeSelect id={id} value={current} onChange={(e) => onChange(e.target.value)} className={className}>
      {!options.some((z) => z.id === current) && <option value={current}>{current}</option>}
      {options.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
    </NativeSelect>
  )
}
