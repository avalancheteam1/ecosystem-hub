'use client'

import { zonedToUtc } from '@/lib/timezones'

/**
 * Date + time as wall-clock time in `timeZone` (shown next to the input).
 * `value` is "YYYY-MM-DDTHH:mm" in that zone; convert with `toUtcIso` when
 * saving — the database always stores UTC. Initialise with `utcToZoned`.
 */
export function DateTimeInput({ id, value, onChange, timeZone, required }: { id: string; value: string; onChange: (wall: string) => void; timeZone: string; required?: boolean }) {
  return (
    <div className="flex h-11 items-center overflow-hidden rounded-lg border border-input focus-within:border-ring">
      <input id={id} type="datetime-local" required={required} value={value} onChange={(e) => onChange(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none [color-scheme:inherit]" />
      <span className="meta shrink-0 border-l border-line px-3" title={timeZone}>{timeZone}</span>
    </div>
  )
}

/** Wall time in `timeZone` → ISO string in UTC ('' when empty/invalid). */
export function toUtcIso(wall: string, timeZone: string): string {
  return zonedToUtc(wall, timeZone)?.toISOString() ?? ''
}

