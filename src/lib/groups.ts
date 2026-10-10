import { can, type AuthzUser } from '@/lib/permissions'

// Groups (e.g. "team1 Africa"): PURE merge of manual hub memberships with the
// stored member-portal copy (src/lib/member-portal.ts). Loading lives in src/lib/user-groups.ts (server).
// Lead of a group = per-object power (data), not a permission.

export type GroupRef = { id: string; slug: string; name: string; portalChapterSlug: string | null }
/** One chapter of a person as the member portal reports it (POST /api/v1/members/chapters). */
export type PortalChapter = { slug: string; name: string; lead: boolean }
export type UserGroup = { group: GroupRef; lead: boolean; sources: ('manual' | 'portal')[] }

/** Manual rows ∪ portal chapters mapped to hub groups via `linked` (groups whose portalChapterSlug matches). Unlinked chapters are dropped. */
export function mergeGroups(manual: { group: GroupRef; isLead: boolean }[], chapters: PortalChapter[], linked: GroupRef[]): UserGroup[] {
  const out = new Map<string, UserGroup>()
  for (const m of manual) out.set(m.group.id, { group: m.group, lead: m.isLead, sources: ['manual'] })
  for (const c of chapters) {
    const group = linked.find((g) => g.portalChapterSlug === c.slug)
    if (!group) continue
    const prev = out.get(group.id)
    out.set(group.id, prev ? { ...prev, lead: prev.lead || c.lead, sources: [...prev.sources, 'portal'] } : { group, lead: c.lead, sources: ['portal'] })
  }
  return [...out.values()]
}

export function isGroupLead(groups: UserGroup[], groupId: string): boolean {
  return groups.some((g) => g.group.id === groupId && g.lead)
}

export function canViewGroup(user: AuthzUser, groupId: string, groups: UserGroup[]): boolean {
  return can(user, 'referrals.view') || isGroupLead(groups, groupId)
}

/** Portal tiers the hub knows. 'senior' exists in the portal but is super-admin-only there - always shown as 'core'. */
export type PortalTier = 'collaborator' | 'member' | 'core'
export const TIER_LABELS: Record<PortalTier, string> = { collaborator: 'Collaborator', member: 'Member', core: 'Core Member' }

export function normalizeTier(tier: string | null | undefined): PortalTier | null {
  if (tier === 'senior') return 'core'
  return tier === 'collaborator' || tier === 'member' || tier === 'core' ? tier : null
}

/** Stored portal copies older than this are refreshed after the response. */
export const STALE_MS = 24 * 60 * 60 * 1000
export function isStale(fetchedAt: Date | null | undefined, now: Date): boolean {
  return !fetchedAt || now.getTime() - fetchedAt.getTime() > STALE_MS
}

/** Slug of the automatic group for a chapter; `<slug>-chapter` when a manual group already uses the slug. */
export function chapterGroupSlug(chapterSlug: string, takenByManual: ReadonlySet<string>): string {
  return takenByManual.has(chapterSlug) ? `${chapterSlug}-chapter` : chapterSlug
}

/**
 * Groups an onboarding counts for: every manual group + ONLY the referrer's primary
 * chapter group. No primary flagged but exactly one chapter → that one; several and
 * none primary → no chapter group.
 */
export function countingGroups(groups: UserGroup[], chapters: { slug: string; primary: boolean }[]): UserGroup[] {
  const primary = chapters.find((c) => c.primary)?.slug ?? (chapters.length === 1 ? chapters[0]!.slug : null)
  return groups.filter((g) => g.sources.includes('manual') || (g.group.portalChapterSlug !== null && g.group.portalChapterSlug === primary))
}
