// Feature flag registry + resolution. PURE (no DB): the stored values come from `flag-store.ts`.
//
// A flag switches a whole feature on or off from /admin/flags (super admins) without a deploy, e.g. a merged area
// that isn't launched yet. Off = off for everyone (super admins too): every URL under `paths` answers 404 - enforced
// centrally in `src/proxy.ts`, so pages need no check of their own. Admin pages are never in `paths`; they stay
// behind their permission. Keys are persisted (FeatureFlag.key) - only ever ADD keys; a removed key's row is ignored.
// Flags are not permissions: who may do what stays in `permissions.ts`.

export type FlagDef = {
  label: string
  description: string
  /** Value while no row exists (a fresh database, a new flag). */
  default: boolean
  /** URL prefixes the feature owns (each prefix and everything below it). */
  paths: readonly string[]
}

export const FLAGS = {
  miniGrantsIntake: {
    label: 'Continuous Mini Grants intake',
    description: 'Switch new Mini Grant applications from rounds to continuous intake. Existing cases keep their workflow.',
    default: false,
    paths: [],
  },
  miniGrantsReapplication: {
    label: 'Mini Grants reapplication',
    description: 'Allow a new application for a previously declined project after the waiting period and a qualifying change. Requires continuous intake.',
    default: false,
    paths: [],
  },
  tooling: {
    label: 'Community Tools',
    description: 'The public list on /tooling (incl. tool pages and the submit page), its card and preview on /ecosystem and its sitemap entries. Review stays available at /admin/tooling.',
    default: false,
    paths: ['/tooling'],
  },
} as const satisfies Record<string, FlagDef>

export type Flag = keyof typeof FLAGS

export const isFlag = (key: string): key is Flag => Object.hasOwn(FLAGS, key)

/** The stored value, or the default while no row exists. */
export const flagOn = (stored: ReadonlyMap<string, boolean>, key: Flag): boolean => stored.get(key) ?? FLAGS[key].default

/** The flag that owns `pathname` (case-insensitive, like Next's routing), if any. */
export function flagForPath(pathname: string): Flag | null {
  const path = pathname.toLowerCase()
  for (const key of Object.keys(FLAGS) as Flag[]) {
    if (FLAGS[key].paths.some((p) => path === p || path.startsWith(p + '/'))) return key
  }
  return null
}
