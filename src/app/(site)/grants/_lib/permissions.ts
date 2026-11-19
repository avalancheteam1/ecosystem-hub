import type { PermissionDef } from '@/lib/permissions'

export const grantPermissions = {
  'grants.review': {
    group: 'grants',
    label: 'Review grant applications and evidence',
    sensitive: 'Sees private applications and internal assessments',
  },
  'grants.decide': {
    group: 'grants',
    label: 'Record authorised grant decisions and amendments',
    sensitive: 'Records funding authority; requires internal approval',
    requires: ['grants.review'],
  },
  'grants.verify': {
    group: 'grants',
    label: 'Verify and accept grant milestone delivery',
    sensitive: 'Acceptance unlocks external payment reporting',
    requires: ['grants.review'],
  },
  'grants.payments': {
    group: 'grants',
    label: 'Record and reconcile external grant payments',
    sensitive: 'Sees payment references and reconciliation evidence',
    requires: ['grants.review'],
  },
  'grants.manage': { group: 'grants', label: 'Manage grant rounds and review sets', requires: ['grants.review'] },
} as const satisfies Record<string, PermissionDef>
