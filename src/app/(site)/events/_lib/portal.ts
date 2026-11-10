import type { LumaEventData } from './luma'

// Member portal API. The list feeds the admin "team1 events" picker (with the key
// and include=private it also lists private events, no address); an event picked there is fetched (import + refresh) from the key-only
// `GET /api/v1/events/{id}/full` (scope `events:read:all`), not from Luma.
// No server-only import: the worker (events-refresh job) uses this via sync.ts.

const PORTAL_URL = (process.env.MEMBER_PORTAL_URL || 'https://members.team1.network').replace(/\/$/, '')

export type PortalEvent = {
  id: string
  name: string | null
  startAt: string
  endAt: string | null
  url: string | null
  coverUrl: string | null
  location: { city: string | null; country: string | null }
  chapter: { slug: string; name: string } | null
  /** only on keyed `include` lists */
  status?: 'public' | 'private' | 'hidden'
}

/** Anonymous: public events that haven't ended. `includePrivate`: public + private (never hidden) with
 *  MEMBER_PORTAL_API_KEY (`events:read:all`), from `from` or else started up to 30 days ago; no key = the anonymous list. */
export async function listPortalEvents(opts: { cursor?: string; from?: string; includePrivate?: boolean } = {}): Promise<{ data: PortalEvent[]; nextCursor: string | null }> {
  const key = opts.includePrivate ? process.env.MEMBER_PORTAL_API_KEY : undefined
  // keyed lists default to startAt >= now - go back so running and recent events show too
  const from = opts.from ?? (key ? new Date(Date.now() - 30 * 86_400_000).toISOString() : undefined)
  const qs = new URLSearchParams({ limit: key ? '200' : '50', order: 'asc', ...(from ? { from } : {}), ...(opts.cursor ? { cursor: opts.cursor } : {}), ...(key ? { include: 'private' } : {}) })
  const res = await fetch(
    `${PORTAL_URL}/api/v1/events?${qs}`,
    key
      ? { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000), cache: 'no-store' }
      : { signal: AbortSignal.timeout(10_000), next: { revalidate: 300 } },
  )
  if (!res.ok) throw new Error(`Member portal answered ${res.status}`)
  const body = (await res.json()) as { data?: PortalEvent[]; nextCursor?: string | null }
  return { data: body.data ?? [], nextCursor: body.nextCursor ?? null }
}

export class PortalEventError extends Error {}
/** Missing or refused API key - every further portal call would fail the same way. */
export class PortalAuthError extends PortalEventError {}
/** The portal answered 404 - the event was deleted there. */
export class PortalEventGoneError extends PortalEventError {}

/** A private/hidden portal event carries its exact address + description - never publish (list) it on the hub, and never show
 *  those details or its Luma link. It can be unlisted (link only), e.g. to run an invite-only hackathon. */
export const blocksPublish = (e: { source: string; lumaVisibility: string }) => e.source === 'portal' && e.lumaVisibility !== 'public'
export const BLOCKS_PUBLISH_MESSAGE = 'Not public in the member portal - it can only be unlisted here (address and description stay hidden)'

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const date = (v: unknown): Date | null => {
  const d = typeof v === 'string' ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : null
}

/** Map a portal `events/{id}/full` response to the hub's event fields; null unless usable. */
export function mapPortalEvent(payload: unknown): LumaEventData | null {
  const e = payload as Record<string, unknown> | null
  const id = str(e?.id)
  const name = str(e?.name)
  const startAt = date(e?.startAt)
  if (!e || !id?.startsWith('evt-') || !name || !startAt) return null
  const loc = (e.location ?? {}) as Record<string, unknown>
  const city = str(loc.city)
  const fullAddress = str(loc.fullAddress)
  const country = str(loc.country)
  return {
    lumaEventId: id,
    lumaUrl: str(e.url) ?? `https://luma.com/${id}`,
    name,
    descriptionMd: str(e.descriptionMd),
    startAt,
    endAt: date(e.endAt),
    timezone: str(e.timezone) ?? 'UTC',
    coverUrl: str(e.coverUrl),
    city,
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    fullAddress,
    // ponytail: the portal has no location type - no address and no city reads as online
    isOnline: !fullAddress && !city,
    // Fail closed: a missing status must never make a private event publishable (blocksPublish).
    lumaVisibility: str(e.status) ?? 'unknown',
  }
}

/** One event (public, private or hidden) by evt- id. Needs MEMBER_PORTAL_API_KEY with `events:read:all`. */
export async function fetchPortalEvent(id: string): Promise<LumaEventData> {
  const key = process.env.MEMBER_PORTAL_API_KEY
  if (!key) throw new PortalAuthError('MEMBER_PORTAL_API_KEY is not set')
  let res: Response
  try {
    res = await fetch(`${PORTAL_URL}/api/v1/events/${encodeURIComponent(id)}/full`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
  } catch {
    throw new PortalEventError('The member portal is unreachable right now - try again in a minute')
  }
  if (res.status === 404) throw new PortalEventGoneError('The member portal has no such event')
  if (res.status === 401 || res.status === 403) throw new PortalAuthError('The member portal refused the API key (needs scope events:read:all)')
  if (!res.ok) throw new PortalEventError(`Member portal answered ${res.status}`)
  const data = mapPortalEvent(await res.json().catch(() => null))
  if (!data) throw new PortalEventError('The member portal returned an unusable event')
  return data
}
