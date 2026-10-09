// Social platforms of a link, detected from its host. Pure, isomorphic.
// Detection ported from avalanche-cascade (SocialLinksForm detectLinkTypeFromUrl).
// Keys are persisted (ProjectVersion.socials[].tag) — only add, never rename.

export const SOCIAL_PLATFORMS = {
  x: { label: 'X', hosts: ['x.com', 'twitter.com'] },
  linkedin: { label: 'LinkedIn', hosts: ['linkedin.com'] },
  github: { label: 'GitHub', hosts: ['github.com'] },
  telegram: { label: 'Telegram', hosts: ['t.me', 'telegram.me', 'telegram.org'] },
  discord: { label: 'Discord', hosts: ['discord.gg', 'discord.com', 'discordapp.com'] },
  youtube: { label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
  medium: { label: 'Medium', hosts: ['medium.com'] },
  instagram: { label: 'Instagram', hosts: ['instagram.com'] },
  tiktok: { label: 'TikTok', hosts: ['tiktok.com'] },
  facebook: { label: 'Facebook', hosts: ['facebook.com', 'fb.com'] },
  reddit: { label: 'Reddit', hosts: ['reddit.com'] },
  bluesky: { label: 'Bluesky', hosts: ['bsky.app'] },
  farcaster: { label: 'Farcaster', hosts: ['farcaster.xyz', 'warpcast.com'] },
  linktree: { label: 'Linktree', hosts: ['linktr.ee'] },
  other: { label: 'Other', hosts: [] },
} as const satisfies Record<string, { label: string; hosts: readonly string[] }>

export type SocialPlatformKey = keyof typeof SOCIAL_PLATFORMS

export const isSocialPlatform = (k: string): k is SocialPlatformKey => Object.hasOwn(SOCIAL_PLATFORMS, k)

/** Platform of a link (with or without scheme, any subdomain), or null when unknown. */
export function detectPlatform(url: string): Exclude<SocialPlatformKey, 'other'> | null {
  const v = url.trim()
  if (!v) return null
  let host: string
  try {
    host = new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase()
  } catch {
    return null
  }
  for (const [key, p] of Object.entries(SOCIAL_PLATFORMS)) {
    if (p.hosts.some((h: string) => host === h || host.endsWith(`.${h}`))) return key as Exclude<SocialPlatformKey, 'other'>
  }
  return null
}

/** Display label of a stored { tag, url }: known key → platform name; older free-text tags shown as written; else the host. */
export function socialLabel(l: { tag: string; url: string }): string {
  if (l.tag && l.tag !== 'other') return isSocialPlatform(l.tag) ? SOCIAL_PLATFORMS[l.tag].label : l.tag
  try {
    return new URL(l.url).hostname.replace(/^www\./, '')
  } catch {
    return l.url
  }
}
