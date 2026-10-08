import { can, type AuthzUser } from '@/lib/permissions'

/** /admin/events: `events.manage`, or `hackathons.manage` (a hackathon starts from an event). */
export const canManageEvents = (u: AuthzUser | null | undefined) => can(u, 'events.manage') || can(u, 'hackathons.manage')
