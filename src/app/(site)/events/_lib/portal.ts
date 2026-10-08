// Member portal public API (anonymous): published team1 events, used by the
// admin "pick from the portal" list. Import itself always goes through Luma.

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
}

export async function listPortalEvents(opts: { cursor?: string; from?: string } = {}): Promise<{ data: PortalEvent[]; nextCursor: string | null }> {
  const qs = new URLSearchParams({ limit: '50', order: 'asc', ...(opts.from ? { from: opts.from } : {}), ...(opts.cursor ? { cursor: opts.cursor } : {}) })
  const res = await fetch(`${PORTAL_URL}/api/v1/events?${qs}`, { signal: AbortSignal.timeout(10_000), next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`Member portal answered ${res.status}`)
  const body = (await res.json()) as { data?: PortalEvent[]; nextCursor?: string | null }
  return { data: body.data ?? [], nextCursor: body.nextCursor ?? null }
}
