'use client'

import { useRef } from 'react'
import { CalendarClock } from 'lucide-react'
import { zonedToUtc } from '@/lib/timezones'

/**
 * Date + time as wall-clock time in `timeZone` (shown next to the input).
 * `value` is "YYYY-MM-DDTHH:mm" in that zone; convert with `toUtcIso` when
 * saving — the database always stores UTC. Initialise with `utcToZoned`.
 * Typed by hand or picked via the calendar button (the browser's native picker).
 */
export function DateTimeInput({ id, value, onChange, timeZone, required }: { id: string; value: string; onChange: (wall: string) => void; timeZone: string; required?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="flex h-11 items-center overflow-hidden rounded-lg border border-input focus-within:border-ring">
      <input ref={ref} id={id} type="datetime-local" required={required} value={value} onChange={(e) => onChange(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none [color-scheme:inherit] [&::-webkit-calendar-picker-indicator]:hidden" />
      <button type="button" aria-label="Pick date and time" onClick={() => ref.current?.showPicker()} className="flex h-full w-11 shrink-0 items-center justify-center border-l border-line text-fg-muted hover:text-fg-heading">
        <CalendarClock className="size-4" aria-hidden />
      </button>
      <span className="meta max-w-40 shrink-0 truncate border-l border-line px-3" title={timeZone}>{timeZone}</span>
    </div>
  )
}

/** Wall time in `timeZone` → ISO string in UTC ('' when empty/invalid). */
export function toUtcIso(wall: string, timeZone: string): string {
  return zonedToUtc(wall, timeZone)?.toISOString() ?? ''
}
