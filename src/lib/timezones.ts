// Timezone helpers on Intl only (no library). The DB always stores UTC; these
// convert between a UTC instant and the wall-clock time in an IANA zone.
// Pure and isomorphic.

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Offset of `tz` at instant `d`, in minutes (e.g. +330 for Asia/Kolkata). */
function offsetMinutes(d: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!)
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000)
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** "YYYY-MM-DDTHH:mm" in `tz` → UTC Date (null for bad input). Resolves DST by re-checking the offset. */
export function zonedToUtc(wall: string, tz: string): Date | null {
  const m = wall.match(WALL)
  if (!m || !isTimeZone(tz)) return null
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!)
  let utc = guess - offsetMinutes(new Date(guess), tz) * 60_000
  utc = guess - offsetMinutes(new Date(utc), tz) * 60_000 // second pass settles DST edges
  return new Date(utc)
}

/** UTC Date → "YYYY-MM-DDTHH:mm" wall time in `tz` ('' for null). */
export function utcToZoned(d: Date | string | null | undefined, tz: string): string {
  if (!d) return ''
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  const shifted = new Date(date.getTime() + offsetMinutes(date, isTimeZone(tz) ? tz : 'UTC') * 60_000)
  return shifted.toISOString().slice(0, 16)
}

function fmtOffset(min: number): string {
  const sign = min < 0 ? '-' : '+'
  const a = Math.abs(min)
  return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`
}

// ICU builds (Node, some browsers) still list legacy names; Luma and modern
// browsers use the current ones. Normalise so one zone has one name.
const LEGACY: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'America/Godthab': 'America/Nuuk',
  'Pacific/Enderbury': 'Pacific/Kanton',
}

export function canonicalTimeZone(tz: string): string {
  return LEGACY[tz] ?? tz
}

/** UTC first, then every IANA zone, labelled with its offset at `at`. Sorted by offset, then name. */
export function listTimeZones(at = new Date()): { id: string; label: string; offset: number }[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const zones = [...new Set(all.map(canonicalTimeZone))]
    .filter((z) => z !== 'UTC' && z !== 'Etc/UTC' && isTimeZone(z))
    .map((id) => {
      const offset = offsetMinutes(at, id)
      return { id, offset, label: `${fmtOffset(offset)} — ${id}` }
    })
    .sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id))
  return [{ id: 'UTC', offset: 0, label: 'UTC' }, ...zones]
}
