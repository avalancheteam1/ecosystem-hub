// Date display. Event times are shown in the EVENT's timezone (as on Luma), with
// the zone named; never in the server's zone. Pure.

const safeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

const dayFmt = (tz: string, withYear = true) =>
  new Intl.DateTimeFormat('en-US', { timeZone: safeZone(tz), weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
const timeFmt = (tz: string, zoneName: boolean) =>
  new Intl.DateTimeFormat('en-US', { timeZone: safeZone(tz), hour: 'numeric', minute: '2-digit', ...(zoneName ? { timeZoneName: 'short' } : {}) })

export function formatEventDate(d: Date, tz: string): string {
  return dayFmt(tz).format(d)
}

const sameDay = (a: Date, b: Date, tz: string) => dayFmt(tz).format(a) === dayFmt(tz).format(b)

export function formatEventRange(start: Date, end: Date | null, tz: string): string {
  if (!end) return `${formatEventDate(start, tz)}, ${timeFmt(tz, true).format(start)}`
  if (sameDay(start, end, tz)) return `${formatEventDate(start, tz)}, ${timeFmt(tz, false).format(start)} – ${timeFmt(tz, true).format(end)}`
  return `${dayFmt(tz, false).format(start)} – ${formatEventDate(end, tz)}`
}

/** Short card date, e.g. "Oct 8" (+ year when not this year). */
export function formatShortDate(d: Date, tz: string, now = new Date()): string {
  const zone = safeZone(tz)
  const year = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric' })
  const withYear = year.format(d) !== year.format(now)
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }).format(d)
}

/** Admin/UTC timestamps: "2026-10-08 05:30 UTC". */
export function formatUtc(d: Date | null): string {
  return d ? `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '-'
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60]]
/** "3 days ago", "in 2 hours", "just now" - largest whole unit. */
export function formatRelative(d: Date, now = new Date()): string {
  const secs = (d.getTime() - now.getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
  for (const [unit, size] of UNITS) if (Math.abs(secs) >= size) return rtf.format(Math.trunc(secs / size), unit)
  return 'just now'
}
