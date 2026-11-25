import 'server-only'
import { Prisma } from '@prisma/client'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requirePermission, requireUser, denyAccess, denyContext } from '@/lib/guards'
import { canEditProject, TEAM_ROLES } from '@/lib/project-submission'
import { isFlagOn } from '@/lib/flag-store'
import { can } from '@/lib/permissions'
import { hasDemoProof, stateSchema } from './schemas'
import { reviewerOptions } from './reviewers'
import { applicantProjection, applicationStatus } from './rules'
import { grantIntakeHistory, reapplicationEligibility } from './reapplication'

export const publishedRounds = () =>
  prisma.grantRound.findMany({ where: { published: true }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' }, take: 50 })

const roadmapMilestones = () => ({
  where: { status: { in: ['planned', 'in_progress'] }, targetDate: { gte: new Date().toISOString().slice(0, 10) } },
  orderBy: [{ targetDate: 'asc' }, { id: 'asc' }],
  select: { id: true, title: true, targetDate: true },
  take: 30,
} satisfies import('@prisma/client').Prisma.Project$milestonesArgs)

export async function myProjects() {
  const user = await requireUser()
  return prisma.project.findMany({
    where: { archivedAt: null, members: { some: { userId: user.id, role: { in: TEAM_ROLES } } } },
    select: {
      id: true, slug: true,
      currentVersion: { select: {
        name: true, shortDescription: true, logoUrl: true, coverUrl: true, maturity: true, number: true, sealedAt: true,
        fullDescription: true, techDescription: true, techStack: true, githubRepos: true, demoLinks: true, websiteUrl: true,
      } },
      _count: { select: { members: { where: { role: { in: TEAM_ROLES } } } } },
      milestones: roadmapMilestones(),
    },
    take: 100,
  })
}

export const GRANT_PAGE_SIZE = 50

function grantPage(page: number) {
  return { skip: (page - 1) * GRANT_PAGE_SIZE, take: GRANT_PAGE_SIZE + 1 }
}

export async function listApplications(staff: boolean, search = '', page = 1) {
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
      round: { select: { name: true, published: true } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    ...grantPage(page),
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
      project: {
        select: {
          slug: true,
          members: { where: { userId: user.id }, select: { role: true } },
          currentVersion: { select: { demoLinks: true } },
        },
      },
      round: { select: { name: true, published: true } },
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
    round: row.round?.name ?? 'Mini Grants',
    roundOpen: row.round?.published ?? await isFlagOn('miniGrantsIntake'),
    continuous: row.round === null,
    demoProofMissing: !staff && row.status === 'draft' && row.round === null &&
      !hasDemoProof(row.project.currentVersion?.demoLinks ?? []),
    projectSlug: row.project.slug,
    userId: user.id,
    writer: canEditProject(role ?? ''),
  }
  const milestones = !staff && canEditProject(role ?? '') && row.status === 'draft'
    ? await prisma.projectMilestone.findMany({ ...roadmapMilestones(), where: { ...roadmapMilestones().where, projectId: row.projectId } })
    : []
  if (!staff) return { ...common, staff: false as const, state: applicantProjection(state), projectVersion: row.projectVersion, milestones }
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

export async function readReapplicationNotice(projectId: string, applicationId: string) {
  if (!(await isFlagOn('miniGrantsIntake')) || !(await isFlagOn('miniGrantsReapplication'))) return null
  const user = await requireUser()
  const project = await prisma.project.findFirst({
    where: { id: projectId, members: { some: { userId: user.id } } },
    select: { archivedAt: true, members: { where: { userId: user.id }, select: { role: true } } },
  })
  if (!project) denyAccess(user, await denyContext())
  const history = await grantIntakeHistory(prisma, projectId)
  if (!history.latest && !history.unverified) return null
  return {
    eligibility: reapplicationEligibility(history.latest, new Date()),
    previousId: history.latest?.applicationId,
    otherActiveId: history.active.find(({ id }) => id !== applicationId)?.id,
    unverified: history.unverified,
    award: history.award,
    canStart: !project.archivedAt && canEditProject(project.members[0]?.role ?? ''),
  }
}

export async function operations(kind: 'followups' | 'impact', page = 1) {
  const user = await requirePermission('grants.review')
  const rows = await prisma.grantApplication.findMany({
    where: {
      ...(kind === 'impact'
        ? { status: 'approved', state: { path: ['impactPlan'], not: Prisma.JsonNull } }
        : {
            status: { not: 'draft' },
            // JSONB containment of [] requires an array; inequality excludes the empty array.
            AND: [
              { state: { path: ['followups'], array_contains: [] } },
              { state: { path: ['followups'], not: [] } },
            ],
          }),
      project: { members: { none: { userId: user.id } } },
    },
    select: { id: true, state: true, projectVersion: { select: { name: true } } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    ...grantPage(page),
  })
  return rows.map((r) => ({ id: r.id, name: r.projectVersion.name, state: stateSchema.parse(r.state) }))
}

export async function roundComparison(roundId: string | undefined, snapshotId: string | undefined, page: number, snapshotPage: number) {
  const user = await requirePermission('grants.review')
  const where = { applications: { none: { project: { members: { some: { userId: user.id } } } } } }
  const select = { id: true, name: true, published: true, revision: true, choices: true } as const
  const rounds = await prisma.grantRound.findMany({
    where,
    select,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...grantPage(page),
  })
  const round = roundId
    ? rounds.find((r) => r.id === roundId) ?? await prisma.grantRound.findFirst({ where: { ...where, id: roundId }, select })
    : rounds[0]
  if ((roundId && !round) || (snapshotId && !round)) notFound()
  if (!round) return { rounds, round, applications: [], snapshots: [], frozen: null }

  const [applications, snapshots, frozen] = await Promise.all([
    snapshotId ? [] : prisma.grantApplication.findMany({
      where: { roundId: round.id, status: { not: 'draft' } },
      select: { id: true, state: true, projectVersion: { select: { name: true } } },
    }),
    prisma.grantRoundSnapshot.findMany({
      where: { roundId: round.id },
      select: { id: true, number: true, createdAt: true },
      orderBy: { number: 'desc' },
      ...grantPage(snapshotPage),
    }),
    snapshotId ? prisma.grantRoundSnapshot.findFirst({
      where: { id: snapshotId, roundId: round.id },
      select: { data: true, note: true, createdAt: true },
    }) : null,
  ])
  if (snapshotId && !frozen) notFound()
  return { rounds, round, applications, snapshots, frozen }
}
