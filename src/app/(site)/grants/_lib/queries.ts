import 'server-only'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requirePermission, requireUser, denyAccess, denyContext } from '@/lib/guards'
import { canEditProject, TEAM_ROLES } from '@/lib/project-submission'
import { can } from '@/lib/permissions'
import { stateSchema } from './schemas'
import { reviewerOptions } from './reviewers'
import { applicantProjection, applicationStatus } from './rules'

export const publishedRounds = () =>
  prisma.grantRound.findMany({ where: { published: true }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' }, take: 50 })

export async function myProjects() {
  const user = await requireUser()
  return prisma.project.findMany({
    where: { archivedAt: null, members: { some: { userId: user.id, role: { in: TEAM_ROLES } } } },
    select: { id: true, slug: true, currentVersion: { select: { id: true, name: true } } },
    take: 100,
  })
}

export async function listApplications(staff: boolean, search = '') {
  const user = staff ? await requirePermission('grants.review') : await requireUser()
  const rows = await prisma.grantApplication.findMany({
    where: {
      ...(staff
        ? { status: { not: 'draft' }, project: { members: { none: { userId: user.id } } } }
        : { project: { members: { some: { userId: user.id } } } }),
      ...(search ? { projectVersion: { name: { contains: search.slice(0, 100), mode: 'insensitive' } } } : {}),
    },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      state: true,
      projectVersion: { select: { name: true, maturity: true } },
      round: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  return rows.map(({ state, ...row }) => ({ ...row, applicantStatus: applicationStatus(stateSchema.parse(state)) }))
}

export async function readApplication(id: string, staff: boolean) {
  const user = staff ? await requirePermission('grants.review') : await requireUser()
  const row = await prisma.grantApplication.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      projectVersionId: true,
      revision: true,
      status: true,
      state: true,
      projectVersion: true,
      project: { select: { members: { where: { userId: user.id }, select: { role: true } } } },
      round: { select: { name: true } },
    },
  })
  if (!row) notFound()
  const role = row.project.members[0]?.role ?? null
  if (!staff && !role) denyAccess(user, await denyContext())
  if (staff && role) denyAccess(user, await denyContext())
  if (staff && row.status === 'draft') notFound()
  const state = stateSchema.parse(row.state)
  if (staff && !can(user, 'grants.payments')) {
    // Redact at the read boundary, including free-text finance receipts in History.
    state.payments = state.payments.map((p) => ({ ...p, reference: '', evidence: '', note: '' }))
    state.events = state.events.map((e) => (['report_payment', 'reconcile_payment'].includes(e.kind) ? { ...e, note: '' } : e))
  }
  const common = {
    id: row.id,
    projectId: row.projectId,
    projectVersionId: row.projectVersionId,
    revision: row.revision,
    name: row.projectVersion.name,
    round: row.round.name,
    userId: user.id,
    writer: canEditProject(role ?? ''),
  }
  if (!staff) return { ...common, staff: false as const, state: applicantProjection(state), projectVersion: row.projectVersion }
  // The server component consumes this private state. Only the explicit view data goes to client forms.
  return {
    ...common,
    staff: true as const,
    owners: await reviewerOptions(user),
    state,
    projectVersion: row.projectVersion,
    capabilities: {
      review: !role,
      verify: !role && can(user, 'grants.verify'),
      decide: !role && can(user, 'grants.decide'),
      payments: !role && can(user, 'grants.payments'),
      manage: can(user, 'grants.manage'),
    },
  }
}

export async function operations(kind: 'followups' | 'impact') {
  const user = await requirePermission('grants.review')
  const rows = await prisma.grantApplication.findMany({
    where: {
      ...(kind === 'impact' ? { status: 'approved' } : { status: { not: 'draft' } }),
      project: { members: { none: { userId: user.id } } },
    },
    select: { id: true, state: true, projectVersion: { select: { name: true } } },
    take: 100,
    orderBy: { updatedAt: 'desc' },
  })
  return rows
    .map((r) => ({ id: r.id, name: r.projectVersion.name, state: stateSchema.parse(r.state) }))
    .filter((r) => (kind === 'followups' ? r.state.followups.length > 0 : r.state.impactPlan !== null))
}
