import { z } from 'zod'
import { isCountryCode } from '@/lib/countries'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { DEFAULT_NETWORK, PROJECT_NETWORKS, type ProjectNetwork } from '@/lib/project-networks'
import { detectPlatform, isSocialPlatform, type SocialPlatformKey } from '@/lib/social-platforms'
import { MILESTONE_STATUS, PROJECT_CATEGORIES, type MilestoneStatus } from './rules'

// Zod schemas for project fields and milestones. Kept apart from rules.ts so the
// client components that import its constants don't ship zod to the browser.

const httpUrl = z
  .string()
  .trim()
  .max(500, 'Link: max 500 characters')
  .transform((u) => (u && !/^[a-z]+:\/\//i.test(u) ? `https://${u}` : u)) // builders-hub normalizeUrl
  .pipe(z.string().url('Enter a full link, e.g. https://example.com').refine((u) => /^https?:\/\/[^/]*\./i.test(u) || /^https?:\/\/localhost/i.test(u), 'Enter a full link, e.g. https://example.com'))

const optionalUrl = z
  .union([z.literal(''), z.null(), z.undefined(), httpUrl])
  .transform((v) => v || null)

const linkList = (max: number, label: string) =>
  z
    .array(httpUrl)
    .max(max, `At most ${max} ${label}`)
    .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, `Duplicate ${label} aren't allowed`)

const tagged = z.array(z.object({ tag: z.string().trim().max(40, 'Tag: max 40 characters'), url: httpUrl })).max(10, 'At most 10 links')

// Socials: the tag is a stable platform key - the user's pick if it's a known key, otherwise detected from the URL (or 'other').
const socials = z
  .array(z.object({ tag: z.string().optional(), url: httpUrl }).transform(({ tag, url }): { tag: SocialPlatformKey; url: string } => ({ tag: tag && isSocialPlatform(tag) ? tag : (detectPlatform(url) ?? 'other'), url })))
  .max(10, 'At most 10 links')

/** A calendar date as `YYYY-MM-DD` (no time, no zone - a launch day or a milestone's target day). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date').refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().startsWith(d), 'Pick a valid date')

const NETWORK_KEYS = Object.keys(PROJECT_NETWORKS) as [ProjectNetwork, ...ProjectNetwork[]]

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|loom\.com|vimeo\.com)$/i

export const projectFieldsSchema = z
  .object({
    name: z.string().trim().min(1, 'Project name is required').max(60, 'Max 60 characters'),
    shortDescription: z.string().trim().min(1, 'Short description is required').max(280, 'Max 280 characters'),
    fullDescription: z.string().trim().max(20_000, 'Full description: max 20,000 characters'),
    techDescription: z.string().trim().max(10_000, 'How it’s made: max 10,000 characters'),
    techStack: z
      .array(z.string())
      .transform((items) => {
        const seen = new Set<string>()
        return items.map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
      })
      .pipe(z.array(z.string().max(30, 'Tech stack: each technology max 30 characters')).max(20, 'At most 20 technologies')),
    categories: z.array(z.enum(PROJECT_CATEGORIES)).max(8).transform((c) => [...new Set(c)]),
    otherCategory: z.string().trim().max(60).nullable().optional().transform((v) => v || null),
    maturity: z.enum(Object.keys(PROJECT_MATURITY) as [ProjectMaturity, ...ProjectMaturity[]], 'Pick the project stage'),
    launchDate: z.union([z.literal(''), z.null(), isoDate]).optional().transform((v) => v || null),
    country: z.string().nullable().optional().transform((v) => v || null).refine((c) => !c || isCountryCode(c), 'Pick a country from the list'),
    githubRepos: linkList(10, 'repository links'),
    demoLinks: linkList(10, 'demo links').refine((a) => !a.some((u) => /youtube\.com|youtu\.be|loom\.com/i.test(u)), 'Put YouTube and Loom links in the demo video field'),
    videoUrl: optionalUrl.refine((u) => !u || VIDEO_HOSTS.test(new URL(u).hostname), 'Use a YouTube, Loom or Vimeo link'),
    logoUrl: optionalUrl,
    coverUrl: optionalUrl,
    screenshots: z.array(httpUrl).max(5, 'At most 5 screenshots'),
    deployedAddresses: z.array(z.object({ address: z.string().trim().min(1, 'Address is required').max(120, 'Address: max 120 characters'), tag: z.string().trim().max(40, 'Tag: max 40 characters'), network: z.enum(NETWORK_KEYS).default(DEFAULT_NETWORK) })).max(20),
    websites: tagged,
    socials,
  })
  .refine((p) => !p.categories.includes('Other (Specify)') || !!p.otherCategory, { message: 'Please specify the other category', path: ['otherCategory'] })

export type ProjectFields = z.output<typeof projectFieldsSchema>
export type ProjectFieldsInput = z.input<typeof projectFieldsSchema>

export const milestoneSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120, 'Max 120 characters'),
  /** Markdown */
  description: z.string().trim().max(2000, 'Max 2000 characters').optional().transform((v) => v || null),
  targetDate: isoDate,
  status: z.enum(Object.keys(MILESTONE_STATUS) as [MilestoneStatus, ...MilestoneStatus[]]).default('planned'),
})
export type MilestoneInput = z.input<typeof milestoneSchema>
