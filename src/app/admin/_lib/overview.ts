import 'server-only'
import { campusOverview } from '@/app/(app)/campus/_lib/overview'
import { referralsOverview } from '@/app/(app)/referrals/_lib/overview'
import { eventsOverview } from '@/app/(site)/events/_lib/overview'
import { toolingOverview } from '@/app/(site)/tooling/_lib/overview'
import { grantsOverview } from '@/app/(site)/grants/_lib/overview'
import { prisma } from '@/lib/db'
import { can, type AuthzUser } from '@/lib/permissions'

// Admin overview registry (/admin): numbers and open to-dos per area. Like ADMIN_NAV, an area exports its sources from `_lib/overview.ts` and adds them with one line.
// `show` must mirror the guard of the page the numbers link to; counts only, no personal data.

export type OverviewStat = { label: string; value: number; hint?: string; href?: string }
/** Something waiting for someone; shown only while `count > 0`. */
export type OverviewTodo = { label: string; count: number; href: string }
/** `group`: heading the numbers appear under (sources with the same group share a card). */
export type OverviewSource = { group: string; show: (u: AuthzUser) => boolean; load: () => Promise<{ stats?: OverviewStat[]; todos?: OverviewTodo[] }> }

const DAY = 24 * 60 * 60 * 1000
const since = (days: number) => new Date(Date.now() - days * DAY)

const usersOverview: OverviewSource = {
  group: 'People',
  show: (u) => can(u, 'users.view'),
  load: async () => {
    const [total, week] = await Promise.all([prisma.user.count(), prisma.user.count({ where: { createdAt: { gte: since(7) } } })])
    return { stats: [{ label: 'Users', value: total, hint: `+${week} in the last 7 days`, href: '/admin/users' }] }
  },
}

const systemOverview: OverviewSource = {
  group: 'System',
  show: (u) => u.isSuperAdmin,
  load: async () => {
    const [projects, failedJobs] = await Promise.all([
      prisma.project.count({ where: { archivedAt: null } }),
      prisma.jobRun.count({ where: { status: { in: ['failed', 'partial'] }, startedAt: { gte: since(1) } } }),
    ])
    return {
      stats: [{ label: 'Projects', value: projects }],
      todos: [{ label: 'Job runs failed in the last 24 hours', count: failedJobs, href: '/admin/jobs' }],
    }
  },
}

export const ADMIN_OVERVIEW: OverviewSource[] = [usersOverview, ...eventsOverview, ...referralsOverview, ...campusOverview, ...toolingOverview, grantsOverview, systemOverview]

/** Everything `user` may see, loaded in parallel. */
export async function loadOverview(user: AuthzUser) {
  const sources = ADMIN_OVERVIEW.filter((s) => s.show(user))
  const parts = await Promise.all(sources.map(async (s) => ({ group: s.group, ...(await s.load()) })))
  const groups = new Map<string, OverviewStat[]>()
  for (const p of parts) if (p.stats?.length) groups.set(p.group, [...(groups.get(p.group) ?? []), ...p.stats])
  return {
    groups: [...groups].map(([label, stats]) => ({ label, stats })),
    todos: parts.flatMap((p) => (p.todos ?? []).map((t) => ({ ...t, group: p.group }))).filter((t) => t.count > 0),
  }
}
