import { z } from 'zod'

/** A named link an organiser adds (e.g. a hackathon's "Build with" list). */
export type NamedLink = { label: string; url: string }

export const LINK_LIST_MAX = 20
export const isHttpUrl = (u: string) => /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(u)

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

const MARKER = /^\s*(?:[-*+•–-]|\d+[.)]|\[[ xX]\])\s+/ // list bullets, numbering, task boxes
const MD_LINK = /\[([^\]]*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/gi // [name](url "title")
const BARE_URL = /<?(https?:\/\/[^\s<>]+)>?/i
const cleanLabel = (s: string) => s.replace(/^[\s*_`]+|[\s*_`:\u2013\u2014-]+$/g, '').trim()
const hostLabel = (url: string) => new URL(url).hostname.replace(/^www\./, '')

/**
 * Pasted text → links, one or more per line. Understands `[name](url)` (also several per line),
 * `name: url` / `name - url` and bare URLs (named after their host). Leading list markers
 * (`- `, `* `, `1. `, `- [ ] `) are ignored; lines without an http(s) link are skipped.
 */
export function parseLinks(text: string): NamedLink[] {
  const out: NamedLink[] = []
  for (const raw of text.split(/\r?\n/)) {
    let line = raw
    while (MARKER.test(line)) line = line.replace(MARKER, '')
    const md = [...line.matchAll(MD_LINK)]
    const found = md.length
      ? md.map((m) => ({ label: cleanLabel(m[1]!), url: m[2]! }))
      : (() => {
          const m = line.match(BARE_URL)
          return m ? [{ label: cleanLabel(line.slice(0, m.index)), url: m[1]!.replace(/[.,;:!?)\]]+$/, '') }] : []
        })()
    for (const l of found) if (isHttpUrl(l.url)) out.push({ label: l.label || hostLabel(l.url), url: l.url })
  }
  return out
}
