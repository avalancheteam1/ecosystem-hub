import { logger } from '@/lib/logger'
import 'server-only'
import crypto from 'node:crypto'
import { after } from 'next/server'
import { cache } from 'react'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { chapterGroupSlug, isStale, normalizeTier, type PortalTier } from '@/lib/groups'

// Member portal (members.team1.network). The hub keeps a READ-ONLY copy of each
// user's tier + chapters incl. primary flag (PortalProfile / PortalChapterMembership), refreshed on
// sign-in and after 24 h - pages never wait on the portal. Only the sha256 of a
// VERIFIED email leaves the hub; never log email/hash/key.

const PORTAL_URL = (process.env.MEMBER_PORTAL_URL || 'https://members.team1.network').replace(/\/$/, '')

const memberSchema = z.object({
  tier: z.string().nullable(),
  chapters: z.array(z.object({ slug: z.string(), name: z.string(), lead: z.boolean(), primary: z.boolean().default(false), live: z.boolean().default(false) })),
})

export const portalKeyConfigured = () => !!process.env.MEMBER_PORTAL_API_KEY

/** Live portal lookup. null = not configured or failed (callers keep the old copy). */
async function fetchPortalMember(email: string): Promise<z.infer<typeof memberSchema> | null> {
  const key = process.env.MEMBER_PORTAL_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${PORTAL_URL}/api/v1/members/chapters`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ emailHash: crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex') }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    })
    if (!res.ok) throw new Error(`portal answered ${res.status}`)
    return memberSchema.parse(await res.json())
  } catch (err) {
    logger.error({ err }, '[member-portal] member lookup failed')
    return null
  }
}

/** Create/rename the automatic group of each (live) chapter. Never deletes (keeps stats history). */
export async function ensureChapterGroups(chapters: { slug: string; name: string }[]): Promise<void> {
  if (!chapters.length) return
  const existing = await prisma.group.findMany({ select: { id: true, slug: true, name: true, portalChapterSlug: true } })
  const bySlug = new Map(existing.filter((g) => g.portalChapterSlug).map((g) => [g.portalChapterSlug!, g]))
  const manualSlugs = new Set(existing.filter((g) => !g.portalChapterSlug).map((g) => g.slug))
  for (const c of chapters) {
    const group = bySlug.get(c.slug)
    if (group && group.name !== c.name) await prisma.group.update({ where: { id: group.id }, data: { name: c.name } })
    if (!group) {
      try {
        await prisma.group.create({ data: { name: c.name, slug: chapterGroupSlug(c.slug, manualSlugs), portalChapterSlug: c.slug } })
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
        // A concurrent create of the same chapter is fine; otherwise a manual group holds the slug (or `<slug>-chapter`).
        if (!(await prisma.group.findFirst({ where: { portalChapterSlug: c.slug }, select: { id: true } }))) logger.warn({ slug: c.slug }, '[member-portal] chapter group slug collision')
      }
    }
  }
}

/** Mirror the public chapter directory into chapter groups. Returns an error message or null. */
export async function syncChapterGroups(): Promise<string | null> {
  try {
    await ensureChapterGroups(await listPortalChapters())
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'unknown error'
  }
}

/** Fetch the user's tier + chapters and replace the stored copy. Never throws; a failure keeps the old copy. */
export async function refreshPortalProfile(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } })
    if (!user?.emailVerified) return
    const data = await fetchPortalMember(user.email)
    if (!data) return
    await prisma.$transaction([
      prisma.portalProfile.upsert({ where: { userId }, create: { userId, tier: normalizeTier(data.tier), fetchedAt: new Date() }, update: { tier: normalizeTier(data.tier), fetchedAt: new Date() } }),
      prisma.portalChapterMembership.deleteMany({ where: { userId } }),
      prisma.portalChapterMembership.createMany({ data: data.chapters.map((c) => ({ userId, chapterSlug: c.slug, chapterName: c.name, lead: c.lead, primary: c.primary })) }),
    ])
    await ensureChapterGroups(data.chapters.filter((c) => c.live)) // non-live chapters never get a group
  } catch (err) {
    logger.error({ err }, '[member-portal] profile refresh failed')
  }
}

export type PortalProfileView = { tier: PortalTier | null; fetchedAt: Date; chapters: { slug: string; name: string; lead: boolean; primary: boolean }[] }

/** The stored copy (never a live call). Missing/stale → refreshed after the response. Once per request. */
export const getPortalProfile = cache(async (userId: string): Promise<PortalProfileView | null> => {
  const row = await prisma.portalProfile.findUnique({ where: { userId }, include: { chapters: { orderBy: { chapterName: 'asc' } } } })
  if (portalKeyConfigured() && isStale(row?.fetchedAt, new Date())) {
    try {
      after(() => refreshPortalProfile(userId))
    } catch {
      // outside a request scope (scripts) - skip the refresh
    }
  }
  if (!row) return null
  return { tier: normalizeTier(row.tier), fetchedAt: row.fetchedAt, chapters: row.chapters.map((c) => ({ slug: c.chapterSlug, name: c.chapterName, lead: c.lead, primary: c.primary })) }
})

/** Public chapter directory (anonymous) for chapter groups (syncChapterGroups). Throws on failure. */
export async function listPortalChapters(): Promise<{ slug: string; name: string }[]> {
  const res = await fetch(`${PORTAL_URL}/api/v1/chapters`, { signal: AbortSignal.timeout(10_000), next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`Member portal answered ${res.status}`)
  const body = z.object({ data: z.array(z.object({ slug: z.string(), name: z.string() })) }).parse(await res.json())
  return body.data
}

/** Admin-curated public stats (anonymous), already formatted ("60+"). Empty on failure - the home page must not break. */
export async function getPortalStats(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${PORTAL_URL}/api/v1/data/stats`, { signal: AbortSignal.timeout(5_000), next: { revalidate: 3600 } })
    if (!res.ok) return {}
    return z.record(z.string(), z.string()).parse(await res.json())
  } catch {
    return {}
  }
}
