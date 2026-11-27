// Campus rules: university / club pick-lists and the student profile. Pure and isomorphic
// (profile form, its zod schema, admin pages). DB side: src/lib/organizations.ts.

/** Organization.type - persisted, only add. Same ids as the member-portal CRM (for a later join). */
export const ORG_TYPES = ['university', 'blockchain_club'] as const
export type OrgType = (typeof ORG_TYPES)[number]

/** UniversityMembership.kind - persisted, only add. */
export const UNIVERSITY_KINDS = [
  { id: 'student', label: 'Student' },
  { id: 'faculty', label: 'Faculty / professor' },
  { id: 'staff', label: 'Staff' },
] as const
export type UniversityKind = (typeof UNIVERSITY_KINDS)[number]['id']

/** Pick-list; anything else is stored as typed ("Other"). Admins move recurring values in here. */
export const FIELDS_OF_STUDY = ['Computer Science', 'Engineering', 'Business / Economics', 'Finance', 'Law', 'Mathematics / Physics', 'Design / Arts', 'Social Sciences'] as const

/** CampusProfile.trackInterests - persisted, only add. */
export const TRACK_INTERESTS = [
  { id: 'technology', label: 'Technology' },
  { id: 'business', label: 'Business' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'design', label: 'Design' },
  { id: 'research', label: 'Research' },
  { id: 'undecided', label: 'Not sure yet' },
] as const
export type TrackInterest = (typeof TRACK_INTERESTS)[number]['id']

export const MAX_UNIVERSITIES = 5
/** Universities + clubs one user may add per day (the list is shown to everyone). */
export const MAX_NEW_ORGS_PER_DAY = 10

export const graduationYearRange = (now: Date) => ({ min: 1950, max: now.getUTCFullYear() + 10 })

/**
 * Comparison key for duplicate detection: "TU  Wien" and "tu wien" are the same university.
 * ponytail: case, accents, punctuation and spacing only - "TU Wien" vs "Technische Universität
 * Wien" still needs an admin merge (/admin/campus/organizations).
 */
export function normalizeOrgName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // accents: "Universität" -> "Universitat"
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Prisma `where` part: this name or one of the alternative names (pass normalizeOrgName output). */
export const orgNameMatch = (normalized: string) => ({ OR: [{ normalizedName: normalized }, { normalizedAliases: { has: normalized } }] })

export const MAX_ALIASES = 10

/** Alternative names to store: trimmed, one per normalized form, never the org's own name, at most MAX_ALIASES (first ones win). */
export function cleanAliases(name: string, aliases: readonly string[]): { aliases: string[]; normalizedAliases: string[] } {
  const seen = new Set([normalizeOrgName(name)])
  const out = { aliases: [] as string[], normalizedAliases: [] as string[] }
  for (const a of aliases.map((x) => x.trim())) {
    const n = normalizeOrgName(a)
    if (out.aliases.length === MAX_ALIASES) break
    if (n.length < 2 || seen.has(n)) continue
    seen.add(n)
    out.aliases.push(a)
    out.normalizedAliases.push(n)
  }
  return out
}

/** One university row of the profile form: exactly one of an existing university (id), one picked from the catalog (created on save) or a typed-in one. */
export type UniversityEntry = {
  universityId: string | null
  /** `name` is only shown - the server takes name and country from the catalog row */
  catalogUniversity: { rorId: string; name: string } | null
  newUniversity: { name: string; country: string | null } | null
  kind: UniversityKind
  fieldOfStudy: string | null
  graduationYear: number | null
  clubId: string | null
  newClubName: string | null
  clubPosition: string | null
}

export const emptyUniversityEntry = (): UniversityEntry => ({ universityId: null, catalogUniversity: null, newUniversity: null, kind: 'student', fieldOfStudy: null, graduationYear: null, clubId: null, newClubName: null, clubPosition: null })

/** Applies a form patch; a different club resets the position (a position belongs to its club). */
export function updateUniversityEntry(entry: UniversityEntry, patch: Partial<UniversityEntry>): UniversityEntry {
  const next = { ...entry, ...patch }
  if (next.clubId !== entry.clubId || next.newClubName !== entry.newClubName) next.clubPosition = null
  return next
}

/** Students must confirm they are 18+ (the hub doesn't take minors). */
export const needsAdultConfirmation = (entries: readonly { kind: string }[]) => entries.some((e) => e.kind === 'student')

/** Required fields the form can check before saving (the zod schema re-checks on the server). */
export function universityGaps(entries: readonly UniversityEntry[], adultConfirmed: boolean) {
  return {
    none: entries.length === 0,
    university: entries.map((e) => !e.universityId && !e.catalogUniversity && !e.newUniversity?.name.trim()),
    country: entries.map((e) => !!e.newUniversity && !e.newUniversity.country),
    fieldOfStudy: entries.map((e) => e.kind === 'student' && !e.fieldOfStudy?.trim()),
    adult: needsAdultConfirmation(entries) && !adultConfirmed,
  }
}

export function hasUniversityGaps(g: ReturnType<typeof universityGaps>): boolean {
  return g.none || g.adult || [...g.university, ...g.country, ...g.fieldOfStudy].some(Boolean)
}

/** "https://ror.org/03prydq77" or "03prydq77" -> "03prydq77"; null when it isn't a ROR id. */
export function parseRorId(value: string | null | undefined): string | null {
  const id = value?.trim().toLowerCase().replace(/^https?:\/\/ror\.org\//, '')
  return id && /^0[a-z0-9]{6}[0-9]{2}$/.test(id) ? id : null
}

/** University picker value of a catalog entry nobody uses yet (else the value is the Organization id). */
export const CATALOG_VALUE = 'ror:'

/** A catalog row's names as normalizeOrgName keys - what links it to a same-name Organization. */
export const catalogNames = (row: { name: string; aliases: readonly string[] }) => [normalizeOrgName(row.name), ...row.aliases.map(normalizeOrgName)]

export type UniversityHit = { value: string; name: string; aliases: string[]; country: string | null }

/**
 * The university picker's result list. `catalog`: matching catalog rows, biggest first; `linked`:
 * the Organizations holding those rows' rorIds (hidden ones too); `orgs`: visible universities whose
 * own name or alternative names match (any source - typed in, renamed, admin aliases).
 * Catalog rows first - as their Organization when one is linked (hidden: left out), else
 * CATALOG_VALUE + rorId - then the other matching Organizations, except a typed-in twin of a catalog
 * row (same name, same country): picking the catalog row links it (findOrCreateCatalogOrg).
 */
export function mergeUniversityHits(
  catalog: readonly { rorId: string; name: string; aliases: string[]; country: string | null }[],
  linked: readonly { id: string; name: string; aliases: string[]; rorId: string | null; hidden: boolean }[],
  orgs: readonly { id: string; name: string; aliases: string[]; country: string | null; rorId: string | null; normalizedName: string; normalizedAliases: string[] }[],
  limit = 20,
): UniversityHit[] {
  const byRor = new Map(linked.map((o) => [o.rorId, o]))
  const hits = catalog.flatMap((r): UniversityHit[] => {
    const o = byRor.get(r.rorId)
    if (o?.hidden) return []
    return [o ? { value: o.id, name: o.name, aliases: o.aliases, country: r.country } : { value: CATALOG_VALUE + r.rorId, name: r.name, aliases: r.aliases, country: r.country }]
  })
  const keys = catalog.map((r) => ({ country: r.country, names: catalogNames(r) }))
  const twin = (o: (typeof orgs)[number]) => !o.rorId && keys.some((k) => k.country && k.country === o.country && [o.normalizedName, ...o.normalizedAliases].some((n) => k.names.includes(n)))
  for (const o of orgs) if (!hits.some((h) => h.value === o.id) && !twin(o)) hits.push({ value: o.id, name: o.name, aliases: o.aliases, country: o.country })
  return hits.slice(0, limit)
}

/** The words a catalog search must all find in `searchText` (any order); empty below 2 characters. */
export function catalogSearchWords(q: string): string[] {
  const n = normalizeOrgName(q)
  return n.length < 2 ? [] : n.split(' ').slice(0, 6)
}
