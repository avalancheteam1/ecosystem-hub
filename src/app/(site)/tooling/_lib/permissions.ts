import type { PermissionDef } from '@/lib/permissions'

export const toolingPermissions = {
  'tooling.review': { group: 'tooling', label: 'Approve, reject and remove projects on the Developer Tooling list (/tooling)' },
} as const satisfies Record<string, PermissionDef>
