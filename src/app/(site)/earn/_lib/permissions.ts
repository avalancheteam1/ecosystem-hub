import type { PermissionDef } from '@/lib/permissions'

export const earnPermissions = {
  'earn.publish': {
    group: 'earn',
    label: 'Draft and publish team1 bounties',
    sensitive: 'Can make bounties public or take them down. Grant only to designated central team1 publishers.',
  },
} as const satisfies Record<string, PermissionDef>
