import type { PermissionDef } from '@/lib/permissions'

export const earnPermissions = {
  'earn.publish': {
    group: 'earn',
    label: 'Draft and publish team1 bounties',
    sensitive: 'Can make bounties public or take them down. Grant only to designated central team1 publishers.',
  },
  'earn.review': {
    group: 'earn',
    label: 'Review Earn submissions',
    sensitive: 'Sees private work and reviewer notes on public Hub bounties.',
  },
  'earn.finalize': {
    group: 'earn',
    label: 'Select Earn award recipients',
    requires: ['earn.review'],
    sensitive: 'Can select final-stage recipients. Results are announced separately.',
  },
} as const satisfies Record<string, PermissionDef>
