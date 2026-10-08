import type { PermissionDef } from '@/lib/permissions'

export const referralPermissions = {
  'referrals.view': { group: 'referrals', label: 'See onboarding stats of every group and the hub total' },
  'groups.manage': { group: 'referrals', label: 'Create groups, link portal chapters, manage members and leads', sensitive: "Sees manual group members' email addresses and can check whether an email has a hub account" },
} as const satisfies Record<string, PermissionDef>
