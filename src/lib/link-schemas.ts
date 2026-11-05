import { z } from 'zod'
import { hostLabel, isHttpUrl, LINK_LIST_MAX, type NamedLink } from '@/lib/links'

// Zod schemas for named links. Apart from links.ts so the client link editor doesn't ship zod.

export const namedLinkSchema = z.object({
  label: z.string().trim().min(1, 'Give every link a name').max(80),
  url: z.string().trim().url('Enter a full link').refine(isHttpUrl, 'Link must start with https://'),
})
const hostOf = (url: unknown) => { try { return hostLabel(String(url).trim()) } catch { return '' } }
/** Forgiving on save: fully empty rows are dropped, a link without a name is named after its host. */
export const linkListSchema = z.preprocess(
  (v) => Array.isArray(v)
    ? v.filter((l) => String(l?.label ?? '').trim() || String(l?.url ?? '').trim()).map((l) => ({ ...l, label: String(l.label ?? '').trim() || hostOf(l.url) }))
    : v,
  z.array(namedLinkSchema).max(LINK_LIST_MAX, `At most ${LINK_LIST_MAX} links`),
)

/** A stored Json column → links; anything malformed reads as no links. */
export const readLinks = (json: unknown): NamedLink[] => linkListSchema.safeParse(json).data ?? []
