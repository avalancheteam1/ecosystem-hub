// URL slugs for hub entities (events, projects). Pure.

export function slugify(input: string, max = 60): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')
}

/** `base-suffix`, or just the suffix when the base slugified to nothing. Suffix keeps slugs unique. */
export function withSuffix(base: string, suffix: string): string {
  return base ? `${base}-${suffix}` : suffix
}

/** 4 lowercase alphanumerics - collision-checked by the caller's unique index. */
export function shortId(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, '0')
}
