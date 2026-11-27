import 'server-only'
import { Prisma } from '@prisma/client'
import { ActionError } from '@/lib/action-error'
import { CAMPUS_ORG_TYPES, catalogNames, catalogSearchWords, cleanAliases, mergeUniversityHits, MAX_NEW_ORGS_PER_DAY, normalizeOrgName, orgNameMatch, type UniversityHit } from '@/lib/campus'
import { prisma } from '@/lib/db'

// Universities + blockchain clubs (Organization). Shared by the profile (pickers, typed-in
// additions) and the campus admin. Rules: src/lib/campus.ts.
// The university picker searches on the server (searchUniversities), so every builder sees the same
// list whether or not somebody picked a university before.

export type OrgOptions = {
  universities: { id: string; name: string; aliases: string[]; country: string | null }[]
  clubs: { id: string; name: string; aliases: string[]; parentId: string | null }[]
}

/**
 * The profile form's start data: `ownIds`' universities (the saved rows' labels, even when hidden
 * since) and every visible club plus the own ones (a short list per university, filtered in the form).
 * ponytail: all clubs to the client - fine for a few thousand.
 */
export async function getOrgOptions(ownIds: string[] = []): Promise<OrgOptions> {
  const rows = await prisma.organization.findMany({ where: { type: { in: [...CAMPUS_ORG_TYPES] }, OR: [{ id: { in: ownIds } }, { type: 'blockchain_club', hidden: false }] }, orderBy: { name: 'asc' }, select: { id: true, type: true, name: true, aliases: true, country: true, parentId: true } })
  return {
    universities: rows.filter((r) => r.type === 'university').map(({ id, name, aliases, country }) => ({ id, name, aliases, country })),
    clubs: rows.filter((r) => r.type === 'blockchain_club').map(({ id, name, aliases, parentId }) => ({ id, name, aliases, parentId })),
  }
}

/**
 * Call inside the transaction after creating: throws (rolling the creates back) when the user now
 * has more than MAX_NEW_ORGS_PER_DAY organizations from the last 24 h (each shows up for everybody).
 * Counts real creates only - re-saving a name that already exists costs nothing.
 */
export async function assertOrgQuota(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const count = await tx.organization.count({ where: { type: { in: [...CAMPUS_ORG_TYPES] }, createdById: userId, createdAt: { gte: since } } })
  if (count > MAX_NEW_ORGS_PER_DAY) throw new ActionError('You added a lot of universities and clubs today - pick from the list or try again tomorrow')
}

/**
 * An existing organization with the same normalized name or alternative name (same type, country, parent) or a new,
 * unverified one. A hidden match is reused too, so junk can't be re-added under the same name.
 * ponytail: check-then-create without a unique index (NULL parents defeat one) - a concurrent
 * double add makes a duplicate an admin merges.
 */
export async function findOrCreateOrg(tx: Prisma.TransactionClient, o: { type: (typeof CAMPUS_ORG_TYPES)[number]; name: string; country: string | null; parentId: string | null; createdById: string }): Promise<{ id: string; created: boolean }> {
  const normalizedName = normalizeOrgName(o.name)
  const existing = await tx.organization.findFirst({ where: { type: o.type, ...orgNameMatch(normalizedName), country: o.country, parentId: o.parentId }, orderBy: { verified: 'desc' }, select: { id: true } })
  if (existing) return { id: existing.id, created: false }
  const created = await tx.organization.create({ data: { type: o.type, name: o.name.trim(), normalizedName, country: o.country, parentId: o.parentId, createdById: o.createdById }, select: { id: true } })
  return { id: created.id, created: true }
}

/**
 * The university picker's search (every word of `q` must match): catalog rows by `searchText`,
 * Organizations by their own name or alternative names. Merged by mergeUniversityHits.
 * ponytail: LIKE scans (~30k catalog rows, a few ms; organizations only the used ones); add pg_trgm if it ever shows up.
 */
export async function searchUniversities(q: string): Promise<UniversityHit[]> {
  const words = catalogSearchWords(q)
  if (!words.length) return []
  // normalizeOrgName output has letters, digits and spaces only - no LIKE wildcards to escape
  const orgWords = Prisma.join(words.map((w) => Prisma.sql`("normalizedName" LIKE ${`%${w}%`} OR array_to_string("normalizedAliases", ' | ') LIKE ${`%${w}%`})`), ' AND ')
  const [catalog, orgs] = await Promise.all([
    prisma.universityCatalog.findMany({ where: { AND: words.map((w) => ({ searchText: { contains: w } })) }, orderBy: [{ worksCount: 'desc' }, { name: 'asc' }], take: 20, select: { rorId: true, name: true, aliases: true, country: true } }),
    prisma.$queryRaw<{ id: string; name: string; aliases: string[]; country: string | null; rorId: string | null; normalizedName: string; normalizedAliases: string[] }[]>`
      SELECT id, name, aliases, country, "rorId", "normalizedName", "normalizedAliases" FROM organizations
      WHERE type = 'university' AND hidden = false AND ${orgWords}
      ORDER BY verified DESC, name ASC LIMIT 10`,
  ])
  const linked = await prisma.organization.findMany({ where: { type: 'university', rorId: { in: catalog.map((r) => r.rorId) } }, select: { id: true, name: true, aliases: true, rorId: true, hidden: true } })
  return mergeUniversityHits(catalog, linked, orgs)
}

/**
 * The university for a catalog pick: the one already linked to `rorId`, else a same-name one in
 * the same country nobody linked yet (a typed-in twin - it gets the link; hidden ones never,
 * or junk would block the real university), else a new verified one from the catalog row. Name and
 * country always come from the catalog, never the client.
 * Not counted in assertOrgQuota (no createdById): these are real universities, not free text.
 */
export async function findOrCreateCatalogOrg(tx: Prisma.TransactionClient, rorId: string): Promise<{ id: string; name: string; country: string | null; hidden: boolean; created: boolean; claimed: boolean }> {
  const select = { id: true, name: true, country: true, hidden: true } as const
  const linked = await tx.organization.findUnique({ where: { rorId, type: 'university' }, select })
  if (linked) return { ...linked, created: false, claimed: false }
  const row = await tx.universityCatalog.findUnique({ where: { rorId } })
  if (!row) throw new ActionError('Pick your university from the list')
  const names = catalogNames(row)
  const match = row.country ? await tx.organization.findFirst({ where: { type: 'university', rorId: null, hidden: false, country: row.country, OR: [{ normalizedName: { in: names } }, { normalizedAliases: { hasSome: names } }] }, orderBy: { verified: 'desc' }, select: { ...select, aliases: true } }) : null
  if (match) {
    await tx.organization.update({ where: { id: match.id }, data: { rorId, verified: true, ...cleanAliases(match.name, [...match.aliases, row.name, ...row.aliases]) } })
    return { id: match.id, name: match.name, country: match.country, hidden: match.hidden, created: false, claimed: true }
  }
  // ON CONFLICT DO NOTHING: a concurrent first pick of the same university waits, then this reads its row
  // (a plain create would fail on the unique rorId and abort the whole save).
  const { count } = await tx.organization.createMany({ data: [{ type: 'university', name: row.name, normalizedName: normalizeOrgName(row.name), country: row.country, rorId, verified: true, ...cleanAliases(row.name, row.aliases) }], skipDuplicates: true })
  const org = await tx.organization.findUniqueOrThrow({ where: { rorId, type: 'university' }, select })
  return { ...org, created: count === 1, claimed: false }
}
