import type { PermissionDef } from '@/lib/permissions'

export const eventPermissions = {
  'hackathons.manage': {
    group: 'hackathons',
    label: 'Import events and run every hackathon',
    sensitive: "Sees participants' registration answers and all judging scores",
  },
  'events.manage': {
    group: 'events',
    label: 'Add, publish and refresh events (no hackathon access)',
  },
} as const satisfies Record<string, PermissionDef>
