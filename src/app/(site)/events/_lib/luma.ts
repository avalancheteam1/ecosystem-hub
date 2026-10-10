import { proseMirrorToMarkdown } from './prosemirror'

// Luma, public data only: the unauthenticated web API behind lu.ma
// (`api.lu.ma/url?url=<slug>`), the same source luma-sync falls back to.
// It is unofficial - it may change or block bots - so every failure is a
// LumaError the UI shows, never a silent miss.

const LUMA_HOSTS = new Set(['lu.ma', 'www.lu.ma', 'luma.com', 'www.luma.com'])
const REF_RE = /^[A-Za-z0-9_-]{1,100}$/

/** Slug or `evt-…` id from a Luma link / bare ref; null if it isn't one. */
export function parseLumaRef(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const looksLikeUrl = s.includes('/') || s.includes('.')
  if (!looksLikeUrl) return REF_RE.test(s) ? s : null
  let url: URL
  try {
    url = new URL(s.includes('://') ? s : `https://${s}`)
  } catch {
    return null
  }
  if (!LUMA_HOSTS.has(url.hostname)) return null
  const last = url.pathname.split('/').filter(Boolean).pop()
  return last && REF_RE.test(last) ? last : null
}

export type LumaEventData = {
  lumaEventId: string
  lumaUrl: string
  name: string
  descriptionMd: string | null
  startAt: Date
  endAt: Date | null
  timezone: string
  coverUrl: string | null
  city: string | null
  country: string | null
  fullAddress: string | null
  isOnline: boolean
  lumaVisibility: string
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const date = (v: unknown): Date | null => {
  const d = typeof v === 'string' ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/** Map an `api.lu.ma/url` response; null unless it's a usable event. */
export function mapLumaEvent(payload: unknown): LumaEventData | null {
  const p = payload as { kind?: unknown; data?: { event?: Record<string, unknown>; description_mirror?: unknown } } | null
  if (!p || p.kind !== 'event' || !p.data?.event) return null
  const e = p.data.event
  const id = str(e.api_id)
  const name = str(e.name)
  const startAt = date(e.start_at)
  if (!id?.startsWith('evt-') || !name || !startAt) return null
  const geo = (e.geo_address_info ?? null) as Record<string, unknown> | null
  const slug = str(e.url)
  const country = str(geo?.country_code)
  const isOnline = e.location_type !== 'offline' || !geo
  const description = proseMirrorToMarkdown(p.data.description_mirror)
  return {
    lumaEventId: id,
    lumaUrl: slug ? (slug.includes('://') ? slug : `https://luma.com/${slug}`) : `https://luma.com/${id}`,
    name,
    descriptionMd: description || null,
    startAt,
    endAt: date(e.end_at),
    timezone: str(e.timezone) ?? 'UTC',
    coverUrl: str(e.cover_url),
    city: isOnline ? null : str(geo?.city),
    country: isOnline ? null : country && /^[A-Z]{2}$/.test(country) ? country : null,
    fullAddress: isOnline ? null : str(geo?.full_address),
    isOnline,
    lumaVisibility: str(e.visibility) ?? 'public',
  }
}

export class LumaError extends Error {
  constructor(public code: 'not_found' | 'unreachable' | 'not_event') {
    super(
      code === 'not_found'
        ? "Luma didn't return this event - is the link right, and is the event public or link-shared?"
        : code === 'not_event'
          ? 'That Luma link is not an event (calendar or profile?)'
          : 'Luma is unreachable right now - try again in a minute',
    )
  }
}

/** Slugs resolve via `url?url=` (wrapped in { kind, data }); evt- ids via `event/get` (bare data). */
export function lumaRequest(ref: string): { url: string; wrapped: boolean } {
  return ref.startsWith('evt-')
    ? { url: `https://api.lu.ma/event/get?event_api_id=${encodeURIComponent(ref)}`, wrapped: false }
    : { url: `https://api.lu.ma/url?url=${encodeURIComponent(ref)}`, wrapped: true }
}

/** Fetch one event by slug or evt- id via Luma's public web API. */
export async function fetchLumaEvent(ref: string): Promise<LumaEventData> {
  const req = lumaRequest(ref)
  let res: Response
  try {
    res = await fetch(req.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; team1-hub/1.0; +https://hub.team1.network)', Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
  } catch {
    throw new LumaError('unreachable')
  }
  if (res.status === 404 || res.status === 400) throw new LumaError('not_found')
  if (!res.ok) throw new LumaError('unreachable')
  const raw = await res.json().catch(() => null)
  const body = req.wrapped ? raw : raw && { kind: 'event', data: raw }
  if (body && (body as { kind?: unknown }).kind && (body as { kind?: unknown }).kind !== 'event') throw new LumaError('not_event')
  const mapped = mapLumaEvent(body)
  if (!mapped) throw new LumaError('not_found')
  return mapped
}
