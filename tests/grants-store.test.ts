import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { CurrentUser } from '@/lib/session'
import type { Permission } from '@/lib/permissions'
import { answers, criterionIds, clearanceIds, stateSchema, type Command, type GrantState, type PlanIntake } from '@/app/(site)/grants/_lib/schemas'
import { addDays, applicantProjection, initialState, planAwardScope, transition } from '@/app/(site)/grants/_lib/rules'
import { projectReviewSnapshot } from '@/app/(site)/grants/_lib/reviewed-project'

// Explicitly opt in; the default Hub suite remains DB-less. Refuse production URLs.
const database = process.env.GRANTS_TEST_DATABASE_URL
if (database) {
  const url = new URL(database)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test'))
    throw new Error('Grant DB tests require a localhost database ending in _test')
  process.env.DATABASE_URL = database
}
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/session', () => {
  const getCurrentUser = vi.fn()
  return {
    getCurrentUser,
    getAuthState: async () => {
      const user = await getCurrentUser()
      return user ? { status: 'signed-in', user } : { status: 'signed-out' }
    },
  }
})
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))
vi.mock('@/lib/monitoring', () => ({ captureError: vi.fn() }))

describe.skipIf(!database)('native grant transactions on isolated Postgres', () => {
  const prefix = `grant-test-${randomUUID()}`
  const userIds: string[] = [],
    projects: string[] = [],
    applications: string[] = []
  let db: PrismaClient, store: typeof import('@/app/(site)/grants/_lib/store'), actions: typeof import('@/app/(site)/grants/_lib/actions')
  let builder: CurrentUser, reviewer: CurrentUser, stranger: CurrentUser, roundId: string
  const featureKeys = ['grants', 'grantsRoundManagement'] as const
  const user = (id: string, permissions: Permission[] = []): CurrentUser => ({
    id,
    name: 'Synthetic test account',
    email: `${id}@example.test`,
    image: null,
    isSuperAdmin: false,
    permissions: new Set(permissions),
    hasSecondFactor: false,
    superAdminNeedsSecondFactor: false,
  })
  const now = () => new Date().toISOString()
  const reviewedProjectFor = async (versionId: string) =>
    projectReviewSnapshot(await db.projectVersion.findUniqueOrThrow({ where: { id: versionId } }))
  const fields = () =>
    answers.parse({
      problem: 'Problem',
      whyGrant: 'Support will fund a reproducible example for builders.',
      outcome: 'Avalanche output',
      capability: 'Evidence',
      funding: 'No overlap',
      maintenance: 'Maintainer',
      risks: 'Dependencies',
      costs: [{ title: 'Work', amountMinor: 500000 }],
      terms: {
        title: 'Quickstart',
        acceptance: 'Independent reproduction',
        amountMinor: 500000,
        due: addDays(now().slice(0, 10), 30),
        maintainer: 'Project team',
        verifier: 'Independent verifier',
        route: 'bounded_pilot',
        hypothesis: 'Independent adoption',
        limits: 'Testnet only',
      },
    })
  function acceptedState(projectVersionId: string): GrantState {
    const apply = (s: GrantState, command: Parameters<typeof transition>[1]) =>
      transition(s, command, { id: randomUUID(), actorId: reviewer.id, now: now(), projectVersionId })
    let s = apply(initialState(fields()), { kind: 'submit_application', confirm: true })
    for (const id of criterionIds)
      s.assessment.criteria[id] = { score: '2', basis: 'E', source: 'Inspected artifact', rationale: 'Supported scope' }
    for (const id of clearanceIds) s.assessment.clearances[id] = { state: 'pass', evidence: 'Verified readiness' }
    s = apply(s, { kind: 'save_assessment', assessment: s.assessment })
    s = apply(s, {
      kind: 'record_decision',
      outcome: 'approved',
      terms: fields().terms,
      rationale: 'Supported',
      publicNote: 'Agreed',
      ownerId: reviewer.id,
      budget: 'test-budget',
      authority: 'test-authority',
    })
    s = apply(s, { kind: 'confirm_terms', confirm: true })
    s = apply(s, {
      kind: 'submit_delivery',
      release: 'https://example.test/release',
      reproduction: 'https://example.test/test',
      note: 'Ready',
    })
    return apply(s, {
      kind: 'review_delivery',
      deliveryId: s.deliveries[0].id,
      outcome: 'accepted',
      inspected: true,
      reproduced: true,
      matches: true,
      note: 'Verified',
      evidence: 'test-verification',
    })
  }
  async function project() {
    const p = await db.project.create({
      data: { slug: `${prefix}-${projects.length}`, ownerId: builder.id, members: { create: { userId: builder.id, role: 'owner' } } },
    })
    projects.push(p.id)
    const version = await db.projectVersion.create({
      data: {
        projectId: p.id,
        number: 1,
        name: 'Synthetic validation project',
        shortDescription: 'Test project',
        fullDescription: 'Full project',
        techDescription: 'How it works',
        techStack: ['TypeScript'],
        categories: ['Developer Tooling'],
        maturity: 'prototype',
        githubRepos: ['https://github.com/example/test'],
        demoLinks: ['https://example.test/demo'],
        screenshots: [],
        createdById: builder.id,
      },
    })
    await db.project.update({ where: { id: p.id }, data: { currentVersionId: version.id } })
    const milestone = await db.projectMilestone.create({
      data: { projectId: p.id, title: fields().terms.title, targetDate: fields().terms.due },
    })
    return { id: p.id, versionId: version.id, milestoneId: milestone.id }
  }
  async function declinedGrant(p: Awaited<ReturnType<typeof project>>, rejectedAt: Date, round: string | null) {
    const previous = { ...fields(), projectMilestoneId: p.milestoneId }
    const initial = initialState(previous)
    const submitted = transition(initial, { kind: 'submit_application', confirm: true }, {
      id: randomUUID(), actorId: builder.id, now: new Date(+rejectedAt - 60_000).toISOString(), projectVersionId: p.versionId,
    })
    const rejected = transition(submitted, {
      kind: 'record_decision', outcome: 'not_selected', terms: null, rationale: 'Internal fixture',
      publicNote: 'Previous decision', ownerId: reviewer.id, budget: '', authority: 'Committee fixture',
    }, { id: randomUUID(), actorId: reviewer.id, now: rejectedAt.toISOString(), projectVersionId: p.versionId })
    await db.projectVersion.update({ where: { id: p.versionId }, data: { sealedAt: rejectedAt } })
    const grant = await db.grantApplication.create({
      data: {
        roundId: round, projectId: p.id, projectVersionId: p.versionId, status: rejected.status,
        state: store.json(rejected), revision: 2,
        revisions: { create: [
          { number: 0, actorId: builder.id, kind: 'create', state: store.json(initial) },
          { number: 1, actorId: builder.id, kind: 'submit_application', state: store.json(submitted) },
          { number: 2, actorId: reviewer.id, kind: 'record_decision', state: store.json(rejected) },
        ] },
      },
    })
    applications.push(grant.id)
    return grant
  }
  async function acceptedGrant() {
    const p = await project(),
      state = acceptedState(p.versionId)
    const row = await db.grantApplication.create({
      data: { roundId, projectId: p.id, projectVersionId: p.versionId, status: state.status, state: store.json(state) },
    })
    applications.push(row.id)
    await db.grantRevision.create({
      data: { applicationId: row.id, number: 0, actorId: builder.id, kind: 'fixture', state: store.json(state) },
    })
    return row
  }
  beforeAll(async () => {
    db = (await import('@/lib/db')).prisma
    store = await import('@/app/(site)/grants/_lib/store')
    actions = await import('@/app/(site)/grants/_lib/actions')
    await db.featureFlag.createMany({ data: featureKeys.map((key) => ({ key, enabled: true })) })
    builder = user(`${prefix}-builder`)
    reviewer = user(`${prefix}-reviewer`, ['grants.review', 'grants.decide', 'grants.verify', 'grants.payments', 'grants.manage'])
    stranger = user(`${prefix}-stranger`)
    for (const u of [builder, reviewer, stranger]) {
      await db.user.create({
        data: { id: u.id, name: u.name, email: u.email, emailVerified: true, builderRoles: [], otherSocials: [], wallets: [], skills: [] },
      })
      userIds.push(u.id)
    }
    roundId = (await db.grantRound.create({ data: { name: prefix, published: true } })).id
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (!db) return
    const fixtureCases = await db.grantApplication.findMany({ where: { projectId: { in: projects } }, select: { id: true } })
    applications.push(...fixtureCases.map(({ id }) => id))
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } })
    await db.grantPaymentReference.deleteMany({ where: { applicationId: { in: applications } } })
    await db.grantRevision.deleteMany({ where: { applicationId: { in: applications } } })
    await db.grantApplication.deleteMany({ where: { id: { in: applications } } })
    if (roundId) {
      await db.grantRoundSnapshot.deleteMany({ where: { roundId } })
      await db.grantRound.delete({ where: { id: roundId } })
    }
    await db.projectActivity.deleteMany({ where: { projectId: { in: projects } } })
    await db.project.updateMany({ where: { id: { in: projects } }, data: { currentVersionId: null } })
    await db.projectMember.deleteMany({ where: { projectId: { in: projects } } })
    await db.projectVersion.deleteMany({ where: { projectId: { in: projects } } })
    await db.project.deleteMany({ where: { id: { in: projects } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.featureFlag.deleteMany({ where: { key: { in: [...featureKeys] } } })
    await db.$disconnect()
  })
  it('US-F3 pauses public writes and independently blocks new round applications', async () => {
    const { clearFlagCache } = await import('@/lib/flag-store')
    const session = await import('@/lib/session')
    const p = await project()
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const setFlag = async (key: (typeof featureKeys)[number], enabled: boolean) => {
      await db.featureFlag.update({ where: { key }, data: { enabled } })
      clearFlagCache()
    }
    try {
      await setFlag('grants', false)
      expect(await actions.startApplication({ projectId: p.id })).toEqual({ ok: false, error: 'Grants is not available right now' })
      await setFlag('grants', true)
      await setFlag('grantsRoundManagement', false)
      expect(await actions.createApplication({ projectId: p.id, roundId, answers: fields(), submit: false }))
        .toEqual({ ok: false, error: 'Legacy grant rounds is not available right now' })
      expect(await db.grantApplication.count({ where: { projectId: p.id } })).toBe(0)
    } finally {
      await setFlag('grants', true)
      await setFlag('grantsRoundManagement', true)
    }
  })
  it('US-1 starts or resumes one roundless case with one receipt and one audit', async () => {
    const session = await import('@/lib/session')
    const p = await project()
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    expect((await actions.startApplication({ projectId: p.id })).ok).toBe(false)
    await db.featureFlag.create({ data: { key: 'miniGrantsIntake', enabled: true } })
    try {
      // Close the fixture's only published round, leaving intake without a configured open round.
      await db.grantRound.update({ where: { id: roundId }, data: { published: false } })
      const results = await Promise.all(Array.from({ length: 8 }, () => actions.startApplication({ projectId: p.id })))
      const cases = await db.grantApplication.findMany({ where: { projectId: p.id } })
      applications.push(...cases.map(({ id }) => id))
      expect(cases).toHaveLength(1)
      const [row] = cases
      expect(results).toEqual(Array(8).fill({ ok: true, data: { id: row.id } }))
      expect(row).toMatchObject({ roundId: null, status: 'draft', revision: 0, projectVersionId: p.versionId })
      expect(await db.grantRevision.count({ where: { applicationId: row.id } })).toBe(1)
      expect(await db.auditLog.count({ where: { entityId: row.id, action: 'grant.create' } })).toBe(1)
      expect((await db.projectVersion.findUniqueOrThrow({ where: { id: p.versionId } })).sealedAt).toBeNull()
      vi.mocked(session.getCurrentUser).mockResolvedValue(null)
      expect(await actions.startApplication({ projectId: p.id })).toEqual({ ok: false, error: 'Not signed in' })
      await db.projectMember.create({ data: { projectId: p.id, userId: stranger.id, role: 'reader' } })
      vi.mocked(session.getCurrentUser).mockResolvedValue(stranger)
      expect(await actions.startApplication({ projectId: p.id })).toEqual({ ok: false, error: 'Only this project owner or a writer may apply' })
      await db.projectMember.updateMany({ where: { projectId: p.id, userId: stranger.id }, data: { role: 'writer' } })
      expect(await actions.startApplication({ projectId: p.id })).toEqual({ ok: true, data: { id: row.id } })
    } finally {
      await db.grantRound.update({ where: { id: roundId }, data: { published: true } })
      await db.featureFlag.delete({ where: { key: 'miniGrantsIntake' } })
    }
  })
  it('US-1 rolls back a continuous start when its create audit fails and records all three rows on retry', async () => {
    const session = await import('@/lib/session')
    const p = await project()
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const create = () => actions.startApplication({ projectId: p.id })
    const actorCreates = { actorId: builder.id, kind: 'create' }
    const audit = { actorId: builder.id, action: 'grant.create', after: { path: ['projectId'], equals: p.id } }
    const originalReceipts = await db.grantRevision.count({ where: actorCreates })
    await db.featureFlag.create({ data: { key: 'miniGrantsIntake', enabled: true } })
    try {
      // Reject just this audit action on the isolated test database. Existing audit rows stay readable.
      await db.$executeRaw`ALTER TABLE audit_logs ADD CONSTRAINT test_grant_create_audit CHECK (action <> 'grant.create') NOT VALID`
      try {
        expect.soft(await create()).toMatchObject({ ok: false })
        expect.soft(await db.grantApplication.count({ where: { projectId: p.id } })).toBe(0)
        expect.soft(await db.grantRevision.count({ where: actorCreates })).toBe(originalReceipts)
        expect(await db.auditLog.count({ where: audit })).toBe(0)
      } finally {
        await db.$executeRaw`ALTER TABLE audit_logs DROP CONSTRAINT test_grant_create_audit`
      }
      const retry = await create()
      if (!retry.ok) throw new Error(retry.error)
      const { id } = retry.data
      expect(await create()).toEqual(retry)
      expect(await db.grantApplication.count({ where: { projectId: p.id } })).toBe(1)
      expect(await db.grantRevision.findMany({ where: { applicationId: id } }))
        .toMatchObject([{ ...actorCreates, number: 0, state: { status: 'draft' } }])
      const audits = await db.auditLog.findMany({ where: audit })
      expect(audits).toMatchObject([{ entityId: id, entityType: 'GrantApplication' }])
      expect(audits[0].after).toEqual({ projectId: p.id, roundId: null, submitted: false, revision: 0 })
    } finally {
      await db.featureFlag.delete({ where: { key: 'miniGrantsIntake' } })
    }
  })
  it.each([
    { command: { kind: 'hold_application' as const, rationale: 'Private fixture', publicNote: 'Review paused', nextStep: 'Check back later' },
      outcome: 'deferred', event: 'grant_held' },
    { command: { kind: 'decline_application' as const, rationale: 'Private fixture', publicNote: 'Application declined' },
      outcome: 'not_selected', event: 'grant_declined' },
  ])('US-6 rolls back $command.kind when its audit fails and commits each record once on retry', async ({ command, outcome, event }) => {
    const { getCurrentUser } = await import('@/lib/session')
    const p = await project()
    await db.featureFlag.create({ data: { key: 'miniGrantsIntake', enabled: true } })
    try {
      const { id } = await store.startGrant(p.id, builder)
      const planAnswers = { intakeVersion: 3 as const, amountMinor: 12500, summary: 'Publish synthetic tooling', milestones: [
        { source: 'application' as const, title: 'Publish quickstart', due: fields().terms.due, evidence: 'Show independent reproduction' },
      ] }
      await store.mutateGrant(id, 0, { kind: 'submit_application', confirm: true, planAnswers,
        reviewedProject: await reviewedProjectFor(p.versionId) }, builder)
      const read = () => db.grantApplication.findUniqueOrThrow({ where: { id } })
      const input = { applicationId: id, revision: 1, command }
      const before = await read()
      const auditWhere = { entityId: id, action: `grant.${command.kind}` }
      const activityWhere = { targetId: id, event }
      const unchanged = async () => {
        expect(await read()).toEqual(before)
        expect(await db.grantRevision.count({ where: { applicationId: id } })).toBe(2)
        expect(await db.projectActivity.count({ where: activityWhere })).toBe(0)
        expect(await db.auditLog.count({ where: auditWhere })).toBe(0)
      }

      vi.mocked(getCurrentUser).mockResolvedValue(user(reviewer.id, ['grants.review']))
      expect(await actions.changeApplication(input)).toEqual({ ok: false, error: 'You cannot perform this grant action' })
      vi.mocked(getCurrentUser).mockResolvedValue(user(builder.id, ['grants.review', 'grants.decide']))
      expect(await actions.changeApplication(input)).toEqual({ ok: false, error: 'A project member cannot review their own grant' })
      await unchanged()

      vi.mocked(getCurrentUser).mockResolvedValue(reviewer)
      await db.$executeRaw`ALTER TABLE audit_logs ADD CONSTRAINT test_grant_decision_audit CHECK (action NOT IN ('grant.hold_application', 'grant.decline_application')) NOT VALID`
      try {
        expect.soft(await actions.changeApplication(input)).toEqual({ ok: false, error: 'Something went wrong' })
        await unchanged()
      } finally {
        await db.$executeRaw`ALTER TABLE audit_logs DROP CONSTRAINT test_grant_decision_audit`
      }

      expect(await actions.changeApplication(input)).toEqual({ ok: true, data: { id, revision: 2 } })
      expect(await actions.changeApplication(input)).toMatchObject({ ok: false, error: expect.stringContaining('changed') })
      expect(await read()).toMatchObject({ revision: 2, status: outcome })
      expect(await db.grantRevision.findMany({ where: { applicationId: id, kind: 'record_decision' } }))
        .toMatchObject([{ number: 2, actorId: reviewer.id, state: { status: outcome } }])
      expect(await db.projectActivity.findMany({ where: activityWhere })).toMatchObject([{ actorId: reviewer.id, reason: null }])
      const audits = await db.auditLog.findMany({ where: auditWhere })
      expect(audits).toMatchObject([{ actorId: reviewer.id, entityType: 'GrantApplication', before: { revision: 1 } }])
      expect(audits[0].after).toEqual({ revision: 2, outcome })
    } finally {
      await db.featureFlag.delete({ where: { key: 'miniGrantsIntake' } })
    }
  })
  it('US-1 requires pinned demo proof only for continuous submissions and preserves the saved draft on refusal', async () => {
    const session = await import('@/lib/session')
    const { readApplication } = await import('@/app/(site)/grants/_lib/queries')
    const p = await project()
    const legacyProject = await project()
    const legacy = await store.createGrant(legacyProject.id, roundId, { ...fields(), projectMilestoneId: legacyProject.milestoneId }, builder)
    applications.push(legacy.id)
    const planAnswers = {
      intakeVersion: 3 as const,
      amountMinor: 10000,
      summary: 'Finish the prototype quickstart',
      milestones: [{ source: 'application' as const, title: 'Publish quickstart', due: fields().terms.due, evidence: 'Replay results' }],
    }
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    await db.featureFlag.create({ data: { key: 'miniGrantsIntake', enabled: true } })
    try {
      const started = await actions.startApplication({ projectId: p.id })
      if (!started.ok) throw new Error(started.error)
      const { id } = started.data
      applications.push(id)
      await expect(store.createGrant(p.id, roundId, fields(), builder)).rejects.toThrow('continuous')
      await db.projectVersion.update({
        where: { id: p.versionId }, data: { demoLinks: [], websiteUrl: 'https://example.test/about' },
      })
      const submit = { kind: 'submit_application' as const, confirm: true as const, planAnswers, reviewedProject: await reviewedProjectFor(p.versionId) }
      const saved = await store.mutateGrant(id, 0, { kind: 'save_application', answers: planAnswers }, builder)
      await expect(store.mutateGrant(id, saved.revision, submit, builder)).rejects.toThrow('demo link')
      expect(await readApplication(id, false)).toMatchObject({ revision: 1, state: { status: 'draft', answers: planAnswers } })
      expect((await db.projectVersion.findUniqueOrThrow({ where: { id: p.versionId } })).sealedAt).toBeNull()
      await db.featureFlag.update({ where: { key: 'miniGrantsIntake' }, data: { enabled: false } })
      await expect(store.mutateGrant(id, saved.revision, submit, builder)).rejects.toThrow('paused')
      await db.featureFlag.update({ where: { key: 'miniGrantsIntake' }, data: { enabled: true } })
      await db.projectVersion.update({ where: { id: p.versionId }, data: { demoLinks: ['https://example.test/demo'] } })
      await expect(store.mutateGrant(id, saved.revision, { ...submit, reviewedProject: await reviewedProjectFor(p.versionId) }, builder)).resolves.toMatchObject({ revision: 2 })
      const legacySaved = await store.mutateGrant(legacy.id, 0, {
        kind: 'save_application', answers: { ...fields(), projectMilestoneId: legacyProject.milestoneId },
      }, builder)
      await store.mutateGrant(legacy.id, legacySaved.revision, { kind: 'submit_application', confirm: true }, builder)
      await db.featureFlag.update({ where: { key: 'miniGrantsIntake' }, data: { enabled: false } })
      vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
      expect(await readApplication(id, true)).toMatchObject({
        state: { status: 'submitted' }, projectVersion: { id: p.versionId, demoLinks: ['https://example.test/demo'] },
      })
      expect(await db.projectActivity.count({ where: { targetId: id, versionId: p.versionId, event: 'submitted' } })).toBe(1)
      expect(await readApplication(legacy.id, true)).toMatchObject({ round: prefix, state: { status: 'submitted' } })
    } finally {
      await db.featureFlag.delete({ where: { key: 'miniGrantsIntake' } })
    }
  })
  it('Grants v1 US-2 uses the latest immutable native decision across rounds and resumes one concurrent draft at the exact UTC boundary', async () => {
    const p = await project()
    const cutoff = new Date('2026-11-25T15:34:56.789Z')
    const latest = await declinedGrant(p, new Date('2026-08-27T15:34:56.789Z'), roundId)
    const older = await declinedGrant(p, new Date('2026-08-01T11:22:33.000Z'), null)
    // Neither mutable case timestamps nor the time the fixture receipt was inserted decide eligibility.
    await db.grantApplication.update({ where: { id: older.id }, data: { updatedAt: new Date() } })
    const changed = await db.projectMilestone.create({
      data: { projectId: p.id, title: 'A new supported roadmap', targetDate: '2027-08-15' },
    })
    await db.featureFlag.createMany({ data: [{ key: 'miniGrantsIntake', enabled: true }, { key: 'miniGrantsReapplication', enabled: true }] })
    try {
      vi.setSystemTime(+cutoff - 1)
      const independent = await store.startGrant((await project()).id, builder)
      applications.push(independent.id)
      expect(independent.created).toBe(true)
      await expect(store.startGrant(p.id, builder)).rejects.toThrow('25 Nov 2026')
      await expect(store.startGrant(p.id, stranger)).rejects.toThrow('Only this project owner or a writer')
      vi.setSystemTime(cutoff)
      const attempts = await Promise.all(Array.from({ length: 8 }, () => store.startGrant(p.id, builder)))
      applications.push(attempts[0].id)
      expect(attempts.filter(({ created }) => created)).toHaveLength(1)
      expect(new Set(attempts.map(({ id }) => id)).size).toBe(1)
      expect(attempts[0].id).not.toBe(latest.id)
      expect(attempts[0].id).not.toBe(older.id)
      expect(await db.grantRevision.count({ where: { applicationId: attempts[0].id } })).toBe(1)
      expect(await db.grantRevision.count({ where: { applicationId: latest.id } })).toBe(3)
      expect(await db.grantRevision.count({ where: { applicationId: older.id } })).toBe(3)
      expect((await db.grantApplication.findUniqueOrThrow({ where: { id: latest.id } })).state).toEqual(latest.state)
      const reviewedProject = await reviewedProjectFor(p.versionId)
      const submit = () => store.mutateGrant(attempts[0].id, 0, {
        kind: 'submit_application', confirm: true, reviewedProject,
        planAnswers: { intakeVersion: 3, amountMinor: 12500, summary: 'New project work',
          milestones: [{ source: 'roadmap', id: changed.id, title: changed.title, due: changed.targetDate, evidence: 'Publish signed build checksums' }],
        },
      }, builder)
      vi.setSystemTime(+cutoff - 1)
      await expect(submit()).rejects.toThrow('25 Nov 2026')
      vi.setSystemTime(cutoff)
      const submissions = await Promise.allSettled([submit(), submit()])
      expect(submissions.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
      expect(await db.grantRevision.count({ where: { applicationId: attempts[0].id } })).toBe(2)
      await store.mutateGrant(attempts[0].id, 1, {
        kind: 'decline_application', rationale: 'Internal fixture', publicNote: 'Updated Committee decision',
      }, reviewer)
      expect(await db.grantRevision.findFirst({ where: { applicationId: attempts[0].id, number: 2 } }))
        .toMatchObject({ kind: 'record_decision', actorId: reviewer.id, state: { status: 'not_selected' } })
      await expect(store.mutateGrant(attempts[0].id, 2, { kind: 'reopen_application', confirm: true }, reviewer))
        .rejects.toThrow(/deferred/i)
      await expect(store.startGrant(p.id, builder)).rejects.toThrow('23 Feb 2027')
    } finally {
      vi.useRealTimers()
      await db.featureFlag.deleteMany({ where: { key: { in: ['miniGrantsIntake', 'miniGrantsReapplication'] } } })
    }
  })
  it('Grants v1 US-2 checks changed roadmap scope on submission and retains drafts on refusal or when paused', async () => {
    const p = await project()
    const prior = await declinedGrant(p, new Date('2026-07-15T00:00:00Z'), roundId)
    const due = '2027-08-15'
    const copied = await db.projectMilestone.create({ data: { projectId: p.id, title: '  QUICKSTART!  ', targetDate: due } })
    const newItem = await db.projectMilestone.create({ data: { projectId: p.id, title: 'Publish an offline indexer', targetDate: due } })
    await db.featureFlag.createMany({ data: [{ key: 'miniGrantsIntake', enabled: true }, { key: 'miniGrantsReapplication', enabled: true }] })
    const submit = async (id: string, item: typeof newItem, evidence: string) => store.mutateGrant(id, 0, {
      kind: 'submit_application', confirm: true, reviewedProject: await reviewedProjectFor(p.versionId),
      planAnswers: { intakeVersion: 3, amountMinor: 12500, summary: 'A rewritten project pitch',
        milestones: [{ source: 'roadmap', id: item.id, title: item.title, due, evidence }] },
    }, builder)
    try {
      vi.setSystemTime(new Date('2026-11-25T00:00:00Z'))
      const { id } = await store.startGrant(p.id, builder)
      applications.push(id)
      await db.featureFlag.update({ where: { key: 'miniGrantsIntake' }, data: { enabled: false } })
      await expect(store.createGrant(p.id, roundId, fields(), builder)).rejects.toThrow('existing grant')
      await db.featureFlag.update({ where: { key: 'miniGrantsIntake' }, data: { enabled: true } })
      await expect(submit(id, copied, 'Matching offline data files')).rejects.toThrow('substantially different deliverable')
      await expect(submit(id, newItem, 'INDEPENDENT reproduction.')).rejects.toThrow('substantially different deliverable')
      vi.setSystemTime(new Date('2026-08-01T00:00:00Z'))
      await expect(submit(id, newItem, 'Compare the output to the published sample block heights')).rejects.toThrow('13 Oct 2026')
      vi.setSystemTime(new Date('2026-11-25T00:00:00Z'))
      await db.featureFlag.update({ where: { key: 'miniGrantsReapplication' }, data: { enabled: false } })
      await expect(submit(id, newItem, 'Compare the output to the published sample block heights')).rejects.toThrow('reapplication is paused')
      expect(await db.grantRevision.count({ where: { applicationId: id } })).toBe(1)
      await db.featureFlag.update({ where: { key: 'miniGrantsReapplication' }, data: { enabled: true } })
      await expect(submit(id, newItem, 'Compare the output to the published sample block heights')).resolves.toEqual({ id, revision: 1 })
      expect((await db.grantApplication.findUniqueOrThrow({ where: { id: prior.id } })).state).toEqual(prior.state)
    } finally {
      vi.useRealTimers()
      await db.featureFlag.deleteMany({ where: { key: { in: ['miniGrantsIntake', 'miniGrantsReapplication'] } } })
    }
  })
  it('Grants v1 US-2 checks proof against the sealed version and blocks active obligations and unknown decline history', async () => {
    const p = await project()
    const unknown = await project()
    const awarded = await acceptedGrant()
    const prior = await declinedGrant(p, new Date('2026-07-15T00:00:00Z'), roundId)
    const unknownPrior = await declinedGrant(unknown, new Date('2026-07-15T00:00:00Z'), roundId)
    await db.grantRevision.deleteMany({ where: { applicationId: unknownPrior.id, kind: 'record_decision' } })
    const previous = await db.projectVersion.findUniqueOrThrow({
      where: { id: p.versionId },
      select: {
        projectId: true, name: true, shortDescription: true, fullDescription: true, techDescription: true,
        techStack: true, categories: true, maturity: true, githubRepos: true, createdById: true,
      },
    })
    const candidate = await db.projectVersion.create({
      data: { ...previous, number: 2, demoLinks: ['https://EXAMPLE.test/demo?revised=true#example'] },
    })
    await db.project.update({ where: { id: p.id }, data: { currentVersionId: candidate.id } })
    await db.featureFlag.createMany({ data: [{ key: 'miniGrantsIntake', enabled: true }, { key: 'miniGrantsReapplication', enabled: true }] })
    try {
      vi.setSystemTime(new Date('2026-11-25T00:00:00Z'))
      await expect(store.startGrant(awarded.projectId, builder)).rejects.toThrow('existing grant')
      await expect(store.startGrant(unknown.id, builder)).rejects.toThrow('previous decision could not be verified')
      await expect(store.startGrant(p.id, builder)).rejects.toThrow('substantially different deliverable')
      await db.projectVersion.update({ where: { id: candidate.id }, data: { demoLinks: ['https://example.test/new-working-demo'] } })
      const { id } = await store.startGrant(p.id, builder)
      applications.push(id)
      const submit = async () => store.mutateGrant(id, 0, { kind: 'submit_application', confirm: true,
        reviewedProject: await reviewedProjectFor(candidate.id), planAnswers: {
        intakeVersion: 3, amountMinor: 12500, summary: 'Original scope with a new working demo',
        milestones: [{ source: 'application', title: 'Quickstart', due: '2027-08-15', evidence: 'Independent reproduction' }],
      } }, builder)
      await db.projectVersion.update({ where: { id: candidate.id }, data: { demoLinks: ['HTTPS://example.test/demo/?copy=1#changed'] } })
      await expect(submit()).rejects.toThrow('substantially different deliverable')
      expect((await db.projectVersion.findUniqueOrThrow({ where: { id: candidate.id } })).sealedAt).toBeNull()
      expect(await db.grantRevision.count({ where: { applicationId: id } })).toBe(1)
      await db.projectVersion.update({ where: { id: candidate.id }, data: { demoLinks: ['https://example.test/new-working-demo'] } })
      await submit()
      expect(await db.grantApplication.findUniqueOrThrow({ where: { id } })).toMatchObject({ projectVersionId: candidate.id, status: 'submitted' })
      expect((await db.grantApplication.findUniqueOrThrow({ where: { id: prior.id } })).projectVersionId).toBe(p.versionId)
    } finally {
      vi.useRealTimers()
      await db.featureFlag.deleteMany({ where: { key: { in: ['miniGrantsIntake', 'miniGrantsReapplication'] } } })
    }
  })
  it('US-2 blocks new legacy starts after a continuous decline, missing receipt or active case with both flags off', async () => {
    const session = await import('@/lib/session')
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const declined = await project(), unverified = await project(), active = await project(), legacy = await project()
    const legacyAnswers = { ...fields(), projectMilestoneId: legacy.milestoneId }
    const saved = await store.createGrant(legacy.id, roundId, legacyAnswers, builder)
    const oldReceipt = await declinedGrant(unverified, new Date(), null)
    await db.grantRevision.deleteMany({ where: { applicationId: oldReceipt.id, kind: 'record_decision' } })
    await db.featureFlag.createMany({ data: [{ key: 'miniGrantsIntake', enabled: true }, { key: 'miniGrantsReapplication', enabled: false }] })
    try {
      const { id } = await store.startGrant(declined.id, builder)
      const planAnswers = { intakeVersion: 3 as const, amountMinor: 12500, summary: 'Synthetic prototype quickstart', milestones: [
        { source: 'application' as const, title: 'Publish the quickstart', due: fields().terms.due, evidence: 'Independent replay verifies the output' },
      ] }
      await store.mutateGrant(id, 0, { kind: 'submit_application', confirm: true, planAnswers,
        reviewedProject: await reviewedProjectFor(declined.versionId) }, builder)
      await store.mutateGrant(id, 1, { kind: 'decline_application', rationale: 'Staff-only fixture', publicNote: 'The application was declined.' }, reviewer)
      await store.startGrant(active.id, builder)
      await db.featureFlag.update({ where: { key: 'miniGrantsIntake' }, data: { enabled: false } })

      const create = (p: typeof declined, submit: boolean) => actions.createApplication({ projectId: p.id, roundId,
        answers: { ...fields(), projectMilestoneId: p.milestoneId }, submit, confirm: submit })
      expect.soft(await create(declined, false)).toMatchObject({ ok: false, error: expect.stringContaining('continuous Mini Grants') })
      expect.soft(await create(unverified, true)).toMatchObject({ ok: false, error: expect.stringContaining('could not be verified') })
      expect.soft(await create(active, false)).toMatchObject({ ok: false, error: expect.stringContaining('existing grant') })
      expect(await db.grantApplication.count({ where: { projectId: { in: [declined.id, unverified.id, active.id] }, roundId } })).toBe(0)
      expect(await db.grantRevision.findFirst({ where: { applicationId: id, number: 2 } }))
        .toMatchObject({ kind: 'record_decision', state: { status: 'not_selected' } })
      const edited = await store.mutateGrant(saved.id, 0, { kind: 'save_application', answers: legacyAnswers }, builder)
      await expect(store.mutateGrant(saved.id, edited.revision, { kind: 'submit_application', confirm: true }, builder))
        .resolves.toMatchObject({ id: saved.id, revision: 2 })
    } finally {
      await db.featureFlag.deleteMany({ where: { key: { in: ['miniGrantsIntake', 'miniGrantsReapplication'] } } })
    }
  })

  it('US-2 blocks a new legacy round submission for an existing same-project award with both flags off', async () => {
    const session = await import('@/lib/session')
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const awarded = await acceptedGrant()
    // Use a roundless historical award so the same-round uniqueness check cannot mask eligibility.
    await db.grantApplication.update({ where: { id: awarded.id }, data: { roundId: null } })
    const milestone = await db.projectMilestone.findFirstOrThrow({ where: { projectId: awarded.projectId } })
    const input = { projectId: awarded.projectId, roundId, answers: { ...fields(), projectMilestoneId: milestone.id }, submit: true, confirm: true }
    expect(await actions.createApplication(input)).toMatchObject({ ok: false, error: expect.stringContaining('existing grant') })
    expect(await db.grantApplication.count({ where: { projectId: awarded.projectId } })).toBe(1)
  })

  it.each(['in-place edit', 'new version'] as const)('Grants v1 US-4 refuses a changed reviewed project after a project change (%s)', async (change) => {
    const session = await import('@/lib/session')
    const { readApplication } = await import('@/app/(site)/grants/_lib/queries')
    const { saveProject } = await import('@/app/(app)/projects/_lib/actions')
    const { fieldsOf } = await import('@/app/(app)/projects/_lib/rules')
    const p = await project()
    const planAnswers: PlanIntake = {
      intakeVersion: 3, amountMinor: 25000, summary: 'Finish the prototype',
      milestones: [{ source: 'application', title: 'Publish the tool', due: fields().terms.due, evidence: 'A reproducible run' }],
    }
    const demoLinks = ['https://example.test/revised-demo']
    await db.featureFlag.create({ data: { key: 'miniGrantsIntake', enabled: true } })
    try {
      await db.projectMember.create({ data: { projectId: p.id, userId: stranger.id, role: 'writer' } })
      if (change === 'new version') await db.projectVersion.update({ where: { id: p.versionId }, data: { sealedAt: new Date() } })
      vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
      const { id } = await store.startGrant(p.id, builder)
      applications.push(id)
      const preview = async (revision: number) => {
        await store.mutateGrant(id, revision, { kind: 'save_application', answers: planAnswers }, builder)
        const readback = await readApplication(id, false)
        if (readback.staff || !readback.draftProject) throw new Error('Expected the persisted applicant draft')
        return { revision: readback.revision, draftProject: readback.draftProject }
      }
      const reviewed = await preview(0)
      const original = await db.projectVersion.findUniqueOrThrow({ where: { id: p.versionId } })
      expect(reviewed.draftProject.demoLinks).toEqual(original.demoLinks)

      vi.mocked(session.getCurrentUser).mockResolvedValue(stranger)
      expect(await saveProject({ projectId: p.id, fields: { ...fieldsOf(original), demoLinks } })).toMatchObject({ ok: true, data: { changed: true } })
      const { currentVersion } = await db.project.findUniqueOrThrow({ where: { id: p.id }, include: { currentVersion: true } })
      if (!currentVersion) throw new Error('Expected the edited project')
      expect(currentVersion.demoLinks).toEqual(demoLinks)
      if (change === 'in-place edit') {
        expect(currentVersion).toMatchObject({ id: original.id, number: original.number })
      } else expect(currentVersion.id).not.toBe(original.id)

      vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
      const confirm = (saved: typeof reviewed) => actions.changeApplication({
        applicationId: id, revision: saved.revision,
        command: { kind: 'submit_application', confirm: true, planAnswers, reviewedProject: saved.draftProject.snapshot },
      })
      expect(await confirm(reviewed)).toMatchObject({ ok: false, error: expect.stringContaining('Review the latest Hub project') })
      expect(await actions.changeApplication({ applicationId: id, revision: reviewed.revision,
        command: { kind: 'submit_application', confirm: true, planAnswers },
      })).toMatchObject({ ok: false, error: expect.stringContaining('Review the latest Hub project') })
      expect(await db.grantApplication.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: 'draft', revision: 1, projectVersionId: p.versionId, state: { applications: [], answers: planAnswers },
      })
      expect(await db.grantRevision.count({ where: { applicationId: id, kind: 'submit_application' } })).toBe(0)
      expect(await db.auditLog.count({ where: { entityId: id, action: 'grant.submit_application' } })).toBe(0)
      expect(await db.projectActivity.count({ where: { targetId: id, event: 'submitted' } })).toBe(0)
      expect((await db.projectVersion.findUniqueOrThrow({ where: { id: currentVersion.id } })).sealedAt).toBeNull()

      const refreshed = await preview(1)
      expect(refreshed.draftProject.snapshot).not.toEqual(reviewed.draftProject.snapshot)
      expect(refreshed.draftProject.demoLinks).toEqual(demoLinks)
      expect(await confirm(refreshed)).toMatchObject({ ok: true, data: { revision: 3 } })
      expect(await readApplication(id, false)).toMatchObject({
        revision: 3, projectVersion: { id: currentVersion.id, demoLinks, sealedAt: expect.any(Date) },
        state: { status: 'submitted', applications: [{ projectVersionId: currentVersion.id, answers: planAnswers }] },
      })
    } finally {
      await db.featureFlag.delete({ where: { key: 'miniGrantsIntake' } })
    }
  })

  it('Grants v1 US-3 validates one to three milestones and pins terms despite later roadmap changes', async () => {
    const session = await import('@/lib/session')
    const p = await project(), foreign = await project(), one = await project()
    const due = fields().terms.due
    const roadmap = { source: 'roadmap' as const, id: p.milestoneId, title: 'Quickstart', due, evidence: 'A passing quickstart' }
    const a = { source: 'application' as const, title: 'Ship a test harness', due, evidence: 'Reproducible test run' }
    const b = { ...a, title: 'Publish sample data', evidence: 'Checksums and dataset' }
    const injected = { ...a, milestoneId: 'injected-id' }
    await db.featureFlag.create({ data: { key: 'miniGrantsIntake', enabled: true } })
    try {
      vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
      const started = await actions.startApplication({ projectId: p.id })
      if (!started.ok) throw new Error(started.error)
      const { id } = started.data
      applications.push(id)
      const reviewedProject = await reviewedProjectFor(p.versionId)
      const submit = (milestones: PlanIntake['milestones']) => actions.changeApplication({
        applicationId: id, revision: 0, command: { kind: 'submit_application', confirm: true, reviewedProject,
          planAnswers: { intakeVersion: 3, amountMinor: 25000, summary: 'Complete open-source tooling', milestones } },
      })
      for (const milestones of [[], [roadmap, a, b, a], [roadmap, roadmap], [{ ...roadmap, id: foreign.milestoneId }], [injected], [{ ...a, evidence: '' }]]) {
        expect(await submit(milestones)).toMatchObject({ ok: false })
        expect(await db.grantRevision.count({ where: { applicationId: id } })).toBe(1)
      }
      await db.projectMilestone.update({ where: { id: p.milestoneId }, data: { title: 'Changed quickstart' } })
      expect(await submit([roadmap, a, b])).toMatchObject({ ok: false, error: expect.stringContaining('roadmap milestone changed') })
      expect((await db.projectVersion.findUniqueOrThrow({ where: { id: p.versionId } })).sealedAt).toBeNull()
      const pinned = { ...roadmap, title: 'Changed quickstart' }
      expect(await submit([pinned, a, b])).toMatchObject({ ok: true, data: { revision: 1 } })
      await db.projectMilestone.delete({ where: { id: p.milestoneId } })
      const row = await db.grantApplication.findUniqueOrThrow({ where: { id } })
      expect(row.state).toMatchObject({ version: 4, applications: [{ projectVersionId: p.versionId,
        answers: { milestones: [pinned, a, b].map((m) => ({ ...m, milestoneId: expect.any(String) })) },
      }] })
      const single = await store.startGrant(one.id, builder)
      applications.push(single.id)
      expect(await actions.changeApplication({ applicationId: single.id, revision: 0,
        command: { kind: 'submit_application', confirm: true, reviewedProject: await reviewedProjectFor(one.versionId),
          planAnswers: { intakeVersion: 3, amountMinor: 100, summary: 'Ship one item', milestones: [a] } },
      })).toMatchObject({ ok: true })
    } finally {
      await db.featureFlag.delete({ where: { key: 'miniGrantsIntake' } })
    }
  })

  it('validates Committee seat access and conflicts in the same transaction as the case write', async () => {
    const p = await project()
    const shortlister = user(`${prefix}-shortlister`, ['grants.review'])
    const committee = Array.from({ length: 4 }, (_value, index) =>
      user(`${prefix}-seat-${index}`, ['grants.review', 'grants.decide']))
    const seatIds = committee.map(({ id }) => id)
    const [firstSeat, secondSeat, , fourthSeat] = committee
    for (const actor of [shortlister, ...committee]) {
      await db.user.create({
        data: { id: actor.id, name: actor.name, email: actor.email, builderRoles: [], otherSocials: [], wallets: [], skills: [] },
      })
      userIds.push(actor.id)
    }
    await db.userPermission.createMany({ data: seatIds.slice(0, 3).map((userId) => ({ userId, permission: 'grants.review' })) })
    vi.stubEnv('GRANTS_SHORTLISTER_ID', shortlister.id)
    vi.stubEnv('GRANTS_COMMITTEE_MEMBER_IDS', seatIds.join(','))
    const planAnswers: PlanIntake = {
      intakeVersion: 3, amountMinor: 500000, summary: 'Deliver the agreed quickstart.',
      milestones: [{ source: 'application', title: 'Quickstart', due: fields().terms.due, evidence: 'Run independently' }],
    }
    const apply = (s: GrantState, command: Command) =>
      transition(s, command, { id: randomUUID(), actorId: reviewer.id, now: now(), projectVersionId: p.versionId })
    let verified = apply(initialState(planAnswers), { kind: 'submit_application', confirm: true, planAnswers })
    if (verified.version !== 4) throw new Error('Expected a version 4 plan')
    const plan = verified.applications[0]
    const [milestone] = plan.answers.milestones
    verified = apply(verified, { kind: 'clear_milestone', confirm: true, planId: plan.id })
    verified = apply(verified, {
      kind: 'submit_delivery', planId: plan.id, milestoneId: milestone.milestoneId, previousAttemptId: null,
      release: 'https://example.test/release', reproduction: 'https://example.test/repro', note: 'Evidence',
    })
    verified = apply(verified, {
      kind: 'review_delivery', planId: plan.id, milestoneId: milestone.milestoneId, deliveryId: verified.deliveries.at(-1)!.id,
      outcome: 'accepted', inspected: true, reproduced: true, matches: true, note: 'Verified', evidence: 'Reproduced',
    })
    const assessment = structuredClone(verified.assessment)
    for (const criterion of criterionIds) assessment.criteria[criterion] = { source: 'Fixture', score: '2', basis: 'E', rationale: 'Fixture' }
    for (const clearance of clearanceIds) assessment.clearances[clearance] = { evidence: 'Fixture', state: 'pass' }
    verified = apply(verified, { kind: 'save_assessment', assessment })
    const { id } = await db.grantApplication.create({
      data: { projectId: p.id, projectVersionId: p.versionId, status: verified.status, state: store.json(verified) },
    })
    applications.push(id)
    let revision = 0
    const { getCurrentUser } = await import('@/lib/session')
    const change = async (command: Command, actor: CurrentUser, expected = revision) => {
      vi.mocked(getCurrentUser).mockResolvedValue(actor)
      const result = await actions.changeApplication({ applicationId: id, revision: expected, command })
      if (result.ok) revision = result.data.revision
      return result
    }
    const workflowFlag = 'grantsCommitteeReview'
    await db.featureFlag.create({ data: { key: workflowFlag, enabled: true } })
    try {
      const shortlist = { kind: 'shortlist_application', planId: plan.id } as const
      expect(await change(shortlist, reviewer)).toMatchObject({ ok: false })
      expect(await change(shortlist, shortlister)).toMatchObject({ ok: false, error: expect.stringContaining('grant review access') })
      await db.userPermission.create({ data: { userId: fourthSeat.id, permission: 'grants.review' } })
      expect(await change(shortlist, shortlister)).toMatchObject({ ok: true, data: { revision: 1 } })
      await db.featureFlag.update({ where: { key: workflowFlag }, data: { enabled: false } })
      const propose = {
        kind: 'request_award_amount', planId: plan.id, totalMinor: 1, reason: 'Propose a smaller amount',
        milestoneAmounts: [{ milestoneId: milestone.milestoneId, amountMinor: 1 }],
      } as const
      expect(await change({ ...propose, milestoneAmounts: [...propose.milestoneAmounts] }, shortlister)).toMatchObject({ ok: true })
      const requested = stateSchema.parse((await db.grantApplication.findUniqueOrThrow({ where: { id } })).state)
      if (requested.version !== 4 || !requested.committeeReview) throw new Error('Expected a shortlisted application')
      const requestId = requested.committeeReview.requests[0].id
      const respond = { kind: 'respond_award_amount', requestId, outcome: 'accepted' } as const
      expect(await change(respond, stranger)).toMatchObject({ ok: false })
      expect(await change(respond, builder)).toMatchObject({ ok: true })
      expect(await change(respond, builder, revision - 1)).toMatchObject({ ok: false, error: expect.stringContaining('record changed') })
      const vote = { kind: 'vote_award', requestId, vote: 'approve', note: 'Private ballot' } as const
      expect(await change(vote, reviewer)).toMatchObject({ ok: false })
      for (const actor of committee)
        expect(await change(vote, actor)).toMatchObject({ ok: true })
      const conflictingMember = await db.projectMember.create({ data: { projectId: p.id, userId: secondSeat.id, role: 'reader' } })
      expect(await change({ ...vote, note: 'Still approve' }, secondSeat)).toMatchObject({ ok: false })
      await expect(store.mutateGrant(id, revision, { ...vote, note: 'Still approve' }, firstSeat)).rejects.toThrow(/membership conflict/i)
      const issue = { kind: 'issue_award', rationale: 'Verified', publicNote: 'Award issued' } as const
      expect(await change(issue, firstSeat)).toMatchObject({ ok: false, error: expect.stringContaining('Finance') })
      const authorization = {
        applicationId: id, revision, planId: plan.id, actorId: firstSeat.id, awardRequestId: requestId,
        authority: 'Committee fixture', budget: 'Finance fixture',
        terms: { ...fields().terms, ...planAwardScope(plan.answers.milestones), amountMinor: propose.totalMinor },
      }
      const issueWithAuthority = () => store.mutateGrant(id, revision, issue, firstSeat, authorization)
      await expect(store.mutateGrant(id, revision, issue, firstSeat, { ...authorization, awardRequestId: 'stale-request' }))
        .rejects.toThrow(/accepted amount request/i)
      await expect(issueWithAuthority()).rejects.toThrow(/membership conflict/i)
      await db.projectMember.delete({ where: { id: conflictingMember.id } })
      await db.userPermission.deleteMany({ where: { userId: fourthSeat.id, permission: 'grants.review' } })
      await expect(store.mutateGrant(id, revision, { ...vote, note: 'Still approve' }, firstSeat)).rejects.toThrow(/grant review access/i)
      await expect(issueWithAuthority()).rejects.toThrow(/grant review access/i)
      expect(await db.auditLog.count({ where: { entityId: id, action: 'grant.issue_award' } })).toBe(0)
      await db.userPermission.create({ data: { userId: fourthSeat.id, permission: 'grants.review' } })
      expect(await issueWithAuthority()).toMatchObject({ revision: revision + 1 })
      const issued = stateSchema.parse((await db.grantApplication.findUniqueOrThrow({ where: { id } })).state)
      expect(issued).toMatchObject({ status: 'approved', committeeReview: { issuedRequestId: requestId } })
      expect(applicantProjection(issued).terms).toMatchObject([{ terms: { amountMinor: 1 } }])
      const receipts = await db.grantRevision.findMany({ where: { applicationId: id }, orderBy: { number: 'asc' } })
      expect(receipts.map(({ kind }) => kind)).toEqual([
        'shortlist_application', 'request_award_amount', 'respond_award_amount',
        'vote_award', 'vote_award', 'vote_award', 'vote_award', 'issue_award',
      ])
      const audit = await db.auditLog.findMany({ where: { entityId: id } })
      expect(audit).toHaveLength(receipts.length)
      expect(audit.find(({ action }) => action === 'grant.issue_award')?.after).toMatchObject({ requestId, planId: plan.id })
      expect(JSON.stringify(audit)).not.toMatch(/Private ballot|Propose a smaller amount|Finance fixture/)
    } finally {
      await db.featureFlag.delete({ where: { key: workflowFlag } })
    }
  })

  it('Grants v1 US-3 and US-6 keep evidence independent and require verified, authorized, atomic award issuance', async () => {
    const session = await import('@/lib/session')
    const { stateSchema } = await import('@/app/(site)/grants/_lib/schemas')
    const { applicantProjection, milestonePlan, planAwardScope } = await import('@/app/(site)/grants/_lib/rules')
    const p = await project()
    await db.featureFlag.create({ data: { key: 'miniGrantsIntake', enabled: true } })
    try {
      const { id } = await store.startGrant(p.id, builder)
      applications.push(id)
      let revision = 0
      async function change(command: object, actor = builder, expected = revision) {
        vi.mocked(session.getCurrentUser).mockResolvedValue(actor)
        const result = await actions.changeApplication({ applicationId: id, revision: expected, command: command as Command })
        if (result.ok) revision = result.data.revision
        return result
      }
      const read = async () => stateSchema.parse((await db.grantApplication.findUniqueOrThrow({ where: { id } })).state)
      const milestones = ['Quickstart', 'Automated checks'].map((title) => ({
        source: 'application', title, due: fields().terms.due, evidence: `Independent reproduction of ${title}`,
      }))
      expect(await change({ kind: 'submit_application', confirm: true, reviewedProject: await reviewedProjectFor(p.versionId),
        planAnswers: { intakeVersion: 3, amountMinor: 500000, summary: 'Ship tooling', milestones },
      })).toMatchObject({ ok: true })
      const submitted = await read()
      if (submitted.version !== 4) throw new Error('Expected a version 4 plan')
      const plan = submitted.applications[0]
      const [a, b] = plan.answers.milestones.map(({ milestoneId }) => milestoneId)
      expect(a).not.toBe(b)
      const approval = { kind: 'clear_milestone', confirm: true, planId: plan.id }
      const submit = { kind: 'submit_delivery', planId: plan.id, milestoneId: a, previousAttemptId: null,
        release: 'https://example.test/release', reproduction: 'https://example.test/replay', note: 'Ready for verification' }
      const review = { kind: 'review_delivery', planId: plan.id, milestoneId: a, outcome: 'accepted',
        inspected: true, reproduced: true, matches: true, note: 'Applicant-facing note', evidence: 'Private verification reference' }
      expect(await change(submit)).toMatchObject({ ok: false })
      expect(await change({ ...approval, planId: 'foreign-plan' }, reviewer)).toMatchObject({ ok: false })
      expect(await change(approval, builder)).toMatchObject({ ok: false })
      expect(await change(approval, user(builder.id, ['grants.review', 'grants.decide']))).toMatchObject({ ok: false })
      expect(await change(approval, reviewer)).toMatchObject({ ok: true })
      await db.featureFlag.update({ where: { key: 'miniGrantsIntake' }, data: { enabled: false } })
      expect(await change({ ...submit, milestoneId: 'foreign-milestone' })).toMatchObject({ ok: false })
      expect(await change(submit, stranger)).toMatchObject({ ok: false })
      const oldRevision = revision
      expect(await change(submit)).toMatchObject({ ok: true })
      expect(await change({ ...submit, milestoneId: b }, builder, oldRevision)).toMatchObject({ ok: false })
      expect(await change({ ...submit, milestoneId: b })).toMatchObject({ ok: true })
      const [first, second] = (await read()).deliveries
      expect(await change({ ...review, deliveryId: second.id }, reviewer)).toMatchObject({ ok: false })
      expect(await change({ ...review, deliveryId: first.id }, user(reviewer.id, ['grants.review']))).toMatchObject({ ok: false })
      expect(await change({ ...review, deliveryId: first.id }, reviewer)).toMatchObject({ ok: true })
      expect(await change({ ...review, milestoneId: b, deliveryId: second.id, outcome: 'changes_requested' }, reviewer)).toMatchObject({ ok: true })
      expect(applicantProjection(await read())).toMatchObject({ milestonePlan: { milestones: [
        { milestoneId: a, status: 'accepted' }, { milestoneId: b, status: 'changes_requested' },
      ] } })
      const award = { kind: 'issue_award', rationale: 'Private award reason', publicNote: 'The Committee issued the award.' } as const
      expect(await change(award, reviewer)).toMatchObject({ ok: false, error: expect.stringContaining('every milestone') })
      expect(await change({ ...submit, milestoneId: b })).toMatchObject({ ok: false })
      expect(await change({ ...submit, milestoneId: b, previousAttemptId: second.id })).toMatchObject({ ok: true })
      expect(await change({ ...review, milestoneId: b, deliveryId: second.id }, reviewer)).toMatchObject({ ok: false })
      const latest = (await read()).deliveries.at(-1)!
      expect(await change({ ...review, milestoneId: b, deliveryId: latest.id, planId: 'foreign-plan' }, reviewer)).toMatchObject({ ok: false })
      expect(await change({ ...review, milestoneId: b, deliveryId: latest.id }, reviewer)).toMatchObject({ ok: true })
      const final = await read()
      expect(final).toMatchObject({ decisions: [], terms: [], payments: [], deliveries: [
        { id: first.id, state: 'accepted' },
        { id: second.id, state: 'changes_requested' },
        { id: latest.id, state: 'accepted' },
      ] })
      expect(JSON.stringify(applicantProjection(final))).not.toContain('Private verification reference')
      expect(await db.grantRevision.count({ where: { applicationId: id } })).toBe(revision + 1)
      expect(await db.auditLog.count({ where: { entityId: id, action: { in: ['grant.clear_milestone', 'grant.submit_delivery', 'grant.review_delivery'] } } })).toBe(7)
      expect(await db.projectActivity.count({ where: { targetId: id, versionId: p.versionId } })).toBe(8)
      expect(await change(award, reviewer)).toMatchObject({
        ok: false, error: expect.stringContaining('current submitted project version'),
      })

      const hold = { kind: 'hold_application', rationale: 'Private hold reason', publicNote: 'We need more time.', nextStep: 'Check back next week.' }
      expect(await change({ ...hold, nextStep: '' }, reviewer)).toMatchObject({ ok: false })
      expect(await change(hold, user(reviewer.id, ['grants.review', 'grants.verify']))).toMatchObject({ ok: false })
      expect(await change(hold, reviewer)).toMatchObject({ ok: true })
      const held = await read()
      expect(held).toMatchObject({ status: 'deferred', terms: [], payments: [], decisions: [{ actorId: reviewer.id, rationale: hold.rationale }] })
      expect(applicantProjection(held).decisions).toEqual([{ outcome: 'deferred', publicNote: hold.publicNote, nextStep: hold.nextStep, at: expect.any(String) }])
      expect(await change(award, reviewer)).toMatchObject({ ok: false })
      const { grantIntakeHistory } = await import('@/app/(site)/grants/_lib/reapplication')
      expect((await grantIntakeHistory(db, p.id)).active).toMatchObject([{ id, status: 'deferred' }])
      expect(await change({ kind: 'reopen_application', confirm: true }, reviewer)).toMatchObject({ ok: true })

      const assessment = structuredClone(final.assessment)
      for (const criterion of criterionIds) assessment.criteria[criterion] = { source: 'Synthetic evidence', score: '2', basis: 'E', rationale: 'Supported' }
      for (const clearance of clearanceIds) assessment.clearances[clearance] = { evidence: 'Synthetic evidence', state: 'pass' }
      expect(await change({ kind: 'save_assessment', assessment }, user(reviewer.id, ['grants.review']))).toMatchObject({ ok: true })
      const awardTerms = { ...fields().terms, ...planAwardScope(milestonePlan(final)!.milestones) }
      const authorization = { applicationId: id, revision, planId: plan.id, actorId: reviewer.id,
        budget: 'Synthetic budget approval', authority: 'Synthetic Committee approval', terms: awardTerms }
      const issue = (source: typeof authorization = authorization, actor = reviewer, expected = revision) =>
        store.mutateGrant(id, expected, award, actor, source)

      expect(await change(award, reviewer)).toMatchObject({ ok: false, error: expect.stringContaining('approval can be verified') })
      expect(await change({ ...award, authorization }, reviewer)).toMatchObject({ ok: false })
      expect(await change({ ...award, ...authorization, kind: 'record_decision', outcome: 'approved', ownerId: reviewer.id }, reviewer))
        .toMatchObject({ ok: false, error: expect.stringContaining('Grants Committee decision workflow') })
      for (const receipt of [
        { budget: '' }, { authority: '' }, { planId: 'foreign-plan' }, { applicationId: 'foreign-case' },
        { actorId: stranger.id }, { revision: revision - 1 },
      ]) await expect(issue({ ...authorization, ...receipt })).rejects.toThrow(/approval can be verified/i)
      await expect(issue({ ...authorization, terms: { ...awardTerms, title: 'Unapproved change' } })).rejects.toThrow(/match the verified/i)
      await expect(issue({ ...authorization, terms: { ...awardTerms, amountMinor: awardTerms.amountMinor + 1 } })).rejects.toThrow(/pinned request/i)
      await expect(issue(authorization, user(reviewer.id, ['grants.review', 'grants.verify']))).rejects.toThrow(/cannot perform/i)
      await expect(issue({ ...authorization, actorId: builder.id }, user(builder.id, ['grants.review', 'grants.decide'])))
        .rejects.toThrow(/own grant/i)
      expect(await db.auditLog.count({ where: { entityId: id, action: 'grant.issue_award' } })).toBe(0)

      const results = await Promise.allSettled([issue(), issue()])
      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
      await expect(issue()).rejects.toThrow(/changed/i)
      await expect(issue({ ...authorization, revision: revision + 1 }, reviewer, revision + 1)).rejects.toThrow(/not awaiting an award/i)
      const issued = await read()
      expect(issued.terms).toHaveLength(1)
      expect(issued.payments).toEqual([])
      expect(issued.decisions.at(-1)).toMatchObject({ actorId: reviewer.id, ownerId: reviewer.id, budget: authorization.budget,
        authority: authorization.authority, terms: awardTerms, rationale: award.rationale })
      expect(applicantProjection(issued)).toMatchObject({ status: 'approved', decisions: [expect.anything(), { publicNote: award.publicNote }],
        terms: [{ terms: { title: awardTerms.title, amountMinor: awardTerms.amountMinor, acceptance: awardTerms.acceptance } }] })
      expect(JSON.stringify(applicantProjection(issued))).not.toMatch(/Synthetic budget approval|Synthetic Committee approval|Private award reason|Private hold reason/)
      const audit = await db.auditLog.findMany({ where: { entityId: id, action: 'grant.issue_award' } })
      expect(audit).toMatchObject([{ actorId: reviewer.id, after: { revision: revision + 1, decisionId: issued.decisions.at(-1)?.id, planId: plan.id } }])
      expect(await db.grantRevision.count({ where: { applicationId: id, kind: 'issue_award' } })).toBe(1)
      expect(await db.projectActivity.findMany({ where: { targetId: id, event: 'grant_award_issued' } }))
        .toMatchObject([{ actorId: reviewer.id, reason: null }])
      expect(await db.grantPaymentReference.count({ where: { applicationId: id } })).toBe(0)
    } finally {
      await db.featureFlag.delete({ where: { key: 'miniGrantsIntake' } })
    }
  })
  it('US-7 confirms one private destination for the exact issued v4 award with zero settlement', async () => {
    const { getCurrentUser } = await import('@/lib/session')
    const { listApplications, readApplication, readPayoutDestination } = await import('@/app/(site)/grants/_lib/queries')
    const { planAwardScope } = await import('@/app/(site)/grants/_lib/rules')
    const { stateSchema } = await import('@/app/(site)/grants/_lib/schemas')
    const p = await project()
    const planAnswers: PlanIntake = {
      intakeVersion: 3, amountMinor: 100, summary: 'Ship a synthetic test fixture',
      milestones: [{ source: 'application', title: 'Quickstart', due: fields().terms.due, evidence: 'Independent reproduction' }],
    }
    const submitted = transition(initialState(planAnswers), { kind: 'submit_application', planAnswers, confirm: true },
      { id: randomUUID(), actorId: builder.id, now: now(), projectVersionId: p.versionId })
    if (submitted.version !== 4) throw new Error('Expected a version 4 plan')
    const plan = submitted.applications[0]
    const milestoneId = plan.answers.milestones[0].milestoneId
    const apply = (state: GrantState, command: Command, actorId = reviewer.id) =>
      transition(state, command, { id: randomUUID(), actorId, now: now(), projectVersionId: p.versionId })
    const cleared = apply(submitted, { kind: 'clear_milestone', confirm: true, planId: plan.id })
    const delivered = apply(cleared, {
      kind: 'submit_delivery', planId: plan.id, milestoneId, previousAttemptId: null,
      release: 'https://example.test/release', reproduction: 'https://example.test/replay', note: 'Synthetic evidence',
    }, builder.id)
    const verified = apply(delivered, {
      kind: 'review_delivery', planId: plan.id, milestoneId, deliveryId: delivered.deliveries[0].id,
      outcome: 'accepted', inspected: true, reproduced: true, matches: true, note: 'Verified', evidence: 'Synthetic review',
    })
    for (const id of criterionIds)
      verified.assessment.criteria[id] = { score: '2', basis: 'E', source: 'Inspected artifact', rationale: 'Supported scope' }
    for (const id of clearanceIds) verified.assessment.clearances[id] = { state: 'pass', evidence: 'Verified readiness' }
    const assessed = apply(verified, { kind: 'save_assessment', assessment: verified.assessment })
    const row = await db.grantApplication.create({
      data: { projectId: p.id, projectVersionId: p.versionId, status: assessed.status, state: store.json(assessed) },
    })
    applications.push(row.id)
    const address = '0x' + 'ab'.repeat(20)
    const input = { applicationId: row.id, revision: 0, awardId: randomUUID(),
      network: 'synthetic-evm', address, confirm: true } as const
    vi.mocked(getCurrentUser).mockResolvedValue(builder)
    vi.stubEnv('GRANTS_SYNTHETIC_PAYOUT_ENABLED', 'true')
    expect(await readPayoutDestination(row.id, false)).toBeNull()
    expect(await actions.confirmPayoutDestination(input)).toMatchObject({ ok: false, error: expect.stringContaining('issued award') })
    const { revision } = await store.mutateGrant(row.id, 0, { kind: 'issue_award', rationale: 'Fixture', publicNote: 'Award issued' },
      reviewer, {
        applicationId: row.id, revision: 0, planId: plan.id, actorId: reviewer.id, budget: 'Synthetic budget', authority: 'Synthetic authority',
        terms: { ...fields().terms, ...planAwardScope(plan.answers.milestones)!, amountMinor: 100 },
      })
    const awarded = await db.grantApplication.findUniqueOrThrow({ where: { id: row.id } })
    const applicant = await readPayoutDestination(row.id, false)
    expect(applicant).toMatchObject({ revision, destination: null })
    const bound = { ...input, revision, awardId: applicant!.awardId }
    vi.stubEnv('GRANTS_SYNTHETIC_PAYOUT_ENABLED', 'false')
    expect(await actions.confirmPayoutDestination(bound)).toMatchObject({ ok: false, error: expect.stringContaining('unavailable') })
    vi.stubEnv('GRANTS_SYNTHETIC_PAYOUT_ENABLED', 'true')
    vi.stubEnv('NODE_ENV', 'production')
    expect(await readPayoutDestination(row.id, false)).toBeNull()
    expect(await actions.confirmPayoutDestination(bound)).toMatchObject({ ok: false, error: expect.stringContaining('unavailable') })
    vi.stubEnv('NODE_ENV', 'test')
    expect(await actions.confirmPayoutDestination({ ...bound, revision: 0 })).toMatchObject({ ok: false, error: expect.stringContaining('changed') })
    expect(await actions.confirmPayoutDestination({ ...bound, awardId: input.awardId })).toMatchObject({ ok: false, error: expect.stringContaining('changed') })
    for (const invalid of [
      { address: '0xinvalid' }, { address: '0x' + '0'.repeat(40) },
      { network: 'foreign-network' }, { confirm: false },
    ]) {
      expect(await actions.confirmPayoutDestination({ ...bound, ...invalid } as typeof input)).toMatchObject({ ok: false })
    }
    const closed = stateSchema.parse(awarded.state)
    closed.closedAt = now()
    await db.grantApplication.update({ where: { id: row.id }, data: { state: store.json(closed) } })
    expect(await readPayoutDestination(row.id, false)).toMatchObject({ canConfirm: false })
    expect(await actions.confirmPayoutDestination(bound)).toMatchObject({ ok: false, error: expect.stringContaining('closed') })
    const beforeConfirmation = await db.grantApplication.update({ where: { id: row.id }, data: { state: store.json(awarded.state) } })
    await db.projectMember.create({ data: { userId: stranger.id, projectId: p.id, role: 'reader' } })
    for (const unauthorized of [stranger, reviewer]) {
      vi.mocked(getCurrentUser).mockResolvedValue(unauthorized)
      expect(await actions.confirmPayoutDestination(bound)).toMatchObject({ ok: false, error: expect.stringContaining('grant') })
    }
    vi.mocked(getCurrentUser).mockResolvedValue(builder)
    const alternate = '0x' + 'cd'.repeat(20)
    const writes = await Promise.all([actions.confirmPayoutDestination(bound),
      actions.confirmPayoutDestination({ ...bound, address: alternate })])
    expect(writes.filter(({ ok }) => ok)).toHaveLength(1)
    const recorded = writes[0].ok ? address : alternate
    expect(await actions.confirmPayoutDestination({ ...bound, address: alternate }))
      .toMatchObject({ ok: false, error: expect.stringContaining('already confirmed') })
    expect(await readPayoutDestination(row.id, false)).toMatchObject({ destination: { address: recorded } })
    expect(JSON.stringify(await readApplication(row.id, false))).not.toContain(recorded)
    vi.mocked(getCurrentUser).mockResolvedValue(stranger)
    expect(await readPayoutDestination(row.id, false)).toBeNull()
    vi.mocked(getCurrentUser).mockResolvedValue(user(stranger.id, ['grants.review', 'grants.payments']))
    expect(await readPayoutDestination(row.id, true)).toBeNull()
    vi.mocked(getCurrentUser).mockResolvedValue(user(reviewer.id, ['grants.review']))
    expect(await readPayoutDestination(row.id, true)).toBeNull()
    vi.mocked(getCurrentUser).mockResolvedValue(reviewer)
    expect(await readPayoutDestination(row.id, true)).toMatchObject({ destination: { address: recorded } })
    expect(JSON.stringify(await readApplication(row.id, true))).not.toContain(recorded)
    expect(JSON.stringify(await listApplications(true))).not.toContain(recorded)
    expect(await db.grantApplication.findUniqueOrThrow({ where: { id: row.id } })).toEqual(beforeConfirmation)
    expect(await db.grantPayoutDestination.findMany({ where: { applicationId: row.id } }))
      .toMatchObject([{ awardId: bound.awardId, network: 'synthetic-evm', asset: 'Synthetic test token', address: recorded }])
    expect(await db.grantRevision.findMany({ where: { applicationId: row.id }, select: { kind: true } }))
      .toEqual([{ kind: 'issue_award' }])
    expect(await db.projectActivity.findMany({ where: { targetId: row.id }, select: { event: true } }))
      .toEqual([{ event: 'grant_award_issued' }])
    expect(await db.grantPaymentReference.count({ where: { applicationId: row.id } })).toBe(0)
    const audit = await db.auditLog.findMany({ where: { entityId: row.id, action: 'grant.confirm_payout_destination' } })
    expect(audit).toMatchObject([{ actorId: builder.id, after: { awardId: bound.awardId, confirmed: true } }])
    expect(JSON.stringify(audit)).not.toContain(recorded)
  }, 20_000)
  it('seals and pins the real project version atomically on submission', async () => {
    const p = await project(),
      created = await store.createGrant(p.id, roundId, { ...fields(), projectMilestoneId: p.milestoneId }, builder)
    applications.push(created.id)
    expect((await db.projectVersion.findUniqueOrThrow({ where: { id: p.versionId } })).sealedAt).toBeNull()
    await store.mutateGrant(created.id, 0, { kind: 'submit_application', confirm: true }, builder)
    const current = await db.grantApplication.findUniqueOrThrow({ where: { id: created.id } })
    expect(current.projectVersionId).toBe(p.versionId)
    expect((await db.projectVersion.findUniqueOrThrow({ where: { id: p.versionId } })).sealedAt).not.toBeNull()
    const update = await db.projectVersion.updateMany({ where: { id: p.versionId, sealedAt: null }, data: { name: 'Forbidden overwrite' } })
    expect(update.count).toBe(0)
    expect(await db.grantRevision.count({ where: { applicationId: created.id } })).toBe(2)
  })
  it('uses the chosen project roadmap milestone and rejects cross-project or outdated selections', async () => {
    const one = await project()
    const two = await project()
    await expect(store.createGrant(one.id, roundId, { ...fields(), projectMilestoneId: two.milestoneId }, builder, true))
      .rejects.toThrow('no longer selectable')
    const row = await store.createGrant(one.id, roundId, { ...fields(), projectMilestoneId: one.milestoneId }, builder)
    applications.push(row.id)
    await db.projectMilestone.update({ where: { id: one.milestoneId }, data: { title: 'Updated roadmap deliverable' } })
    await expect(store.mutateGrant(row.id, 0, { kind: 'submit_application', confirm: true }, builder))
      .rejects.toThrow('milestone changed')
    const updated = { ...fields(), projectMilestoneId: one.milestoneId, terms: { ...fields().terms, title: 'Updated roadmap deliverable' } }
    await store.mutateGrant(row.id, 0, { kind: 'save_application', answers: updated }, builder)
    await store.mutateGrant(row.id, 1, { kind: 'submit_application', confirm: true }, builder)
    await db.projectMilestone.delete({ where: { id: one.milestoneId } })
    const saved = await db.grantApplication.findUniqueOrThrow({ where: { id: row.id } })
    expect(saved.state).toMatchObject({ answers: { terms: { title: 'Updated roadmap deliverable' } }, status: 'submitted' })
  })

  it('keeps a selected milestone draft editable after the round closes but blocks submission', async () => {
    const p = await project()
    const selected = { ...fields(), projectMilestoneId: p.milestoneId }
    const row = await store.createGrant(p.id, roundId, selected, builder)
    applications.push(row.id)
    await db.grantRound.update({ where: { id: roundId }, data: { published: false } })
    try {
      await store.mutateGrant(row.id, 0, { kind: 'save_application', answers: selected }, builder)
      await expect(store.mutateGrant(row.id, 1, { kind: 'submit_application', confirm: true }, builder))
        .rejects.toThrow('This round has closed')
      expect(await db.grantApplication.findUniqueOrThrow({ where: { id: row.id }, select: { status: true } }))
        .toEqual({ status: 'draft' })
    } finally {
      await db.grantRound.update({ where: { id: roundId }, data: { published: true } })
    }
  })

  it('keeps draft applications private from staff writes', async () => {
    const p = await project()
    const row = await store.createGrant(p.id, roundId, fields(), builder)
    applications.push(row.id)
    await expect(store.mutateGrant(row.id, 0, {
      kind: 'save_followup',
      title: 'Request evidence',
      ownerId: reviewer.id,
      due: now().slice(0, 10),
      waitingOn: 'Reviewer',
      note: 'Draft must stay private',
    }, reviewer)).rejects.toThrow('Draft applications are private')
    expect(await db.grantRevision.count({ where: { applicationId: row.id } })).toBe(1)
  })

  it('rechecks revoked membership and refuses cross-project object access', async () => {
    const p = await project(),
      created = await store.createGrant(p.id, roundId, fields(), builder)
    applications.push(created.id)
    await expect(store.mutateGrant(created.id, 0, { kind: 'save_application', answers: fields() }, stranger)).rejects.toThrow(
      'cannot perform',
    )
    await db.projectMember.delete({ where: { projectId_userId: { projectId: p.id, userId: builder.id } } })
    await expect(store.mutateGrant(created.id, 0, { kind: 'submit_application', confirm: true }, builder)).rejects.toThrow('cannot perform')
    expect((await db.grantApplication.findUniqueOrThrow({ where: { id: created.id } })).revision).toBe(0)
  })
  it('permits one writer under concurrent matching-revision updates and preserves receipts', async () => {
    const row = await acceptedGrant(),
      command = {
        kind: 'save_followup' as const,
        title: 'Verify output',
        ownerId: reviewer.id,
        due: now().slice(0, 10),
        waitingOn: 'Reviewer',
        note: 'Action',
      }
    const results = await Promise.allSettled([
      store.mutateGrant(row.id, 0, command, reviewer),
      store.mutateGrant(row.id, 0, command, reviewer),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect((await db.grantApplication.findUniqueOrThrow({ where: { id: row.id } })).revision).toBe(1)
    expect(await db.grantRevision.count({ where: { applicationId: row.id } })).toBe(2)
  })
  it('publishes a funding signal through the authorised action and applicant reads', async () => {
    const p = await project()
    const row = await store.createGrant(p.id, roundId, { ...fields(), projectMilestoneId: p.milestoneId }, builder, true)
    applications.push(row.id)
    const session = await import('@/lib/session')
    const queries = await import('@/app/(site)/grants/_lib/queries')
    const command = { kind: 'release_review_status' as const, status: 'shortlisted' as const }
    await expect(store.mutateGrant(row.id, 0, command, { ...reviewer, permissions: new Set<Permission>(['grants.review']) }))
      .rejects.toThrow('cannot perform')
    await expect(store.mutateGrant(row.id, 0, command, { ...builder, permissions: reviewer.permissions }))
      .rejects.toThrow('cannot review their own')
    vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
    expect(await actions.changeApplication({ applicationId: row.id, revision: 0, command })).toMatchObject({ ok: true })
    await expect(store.mutateGrant(row.id, 0, { ...command, status: 'approval_pending' }, reviewer)).rejects.toThrow('record changed')
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    expect((await queries.listApplications(false)).find((entry) => entry.id === row.id)?.applicantStatus.status).toBe('shortlisted')
    expect(await queries.readApplication(row.id, false)).toMatchObject({
      staff: false,
      state: { applicantStatus: { status: 'shortlisted' }, decisions: [], statusReleases: [{ status: 'shortlisted' }] },
    })
    expect(await db.grantRevision.findFirst({ where: { applicationId: row.id, number: 1 } }))
      .toMatchObject({ kind: 'release_review_status', actorId: reviewer.id })
    expect(await db.auditLog.findFirst({ where: { entityId: row.id, action: 'grant.release_review_status' } })).not.toBeNull()
  })
  it('enforces finance authority and unique references across applications', async () => {
    const one = await acceptedGrant(),
      two = await acceptedGrant(),
      command = {
        kind: 'report_payment' as const,
        reference: `${prefix}-payment`,
        amountMinor: 100000,
        date: now().slice(0, 10),
        evidence: 'https://example.test/receipt',
        note: 'External report',
      }
    await expect(
      store.mutateGrant(one.id, 0, command, { ...reviewer, permissions: new Set<Permission>(['grants.review']) }),
    ).rejects.toThrow('cannot perform')
    await store.mutateGrant(one.id, 0, command, reviewer)
    await expect(store.mutateGrant(two.id, 0, command, reviewer)).rejects.toThrow('already recorded')
    expect((await db.grantApplication.findUniqueOrThrow({ where: { id: two.id } })).revision).toBe(0)
    expect(await db.grantPaymentReference.count({ where: { reference: command.reference } })).toBe(1)
  })
  it('rejects project-member self-review even with a global review permission', async () => {
    const row = await acceptedGrant()
    await expect(
      store.mutateGrant(
        row.id,
        0,
        {
          kind: 'save_followup',
          title: 'Self review',
          ownerId: builder.id,
          due: now().slice(0, 10),
          waitingOn: 'Self',
          note: 'Not allowed',
        },
        { ...builder, permissions: new Set<Permission>(['grants.review']) },
      ),
    ).rejects.toThrow('cannot review their own')
    expect((await db.grantApplication.findUniqueOrThrow({ where: { id: row.id } })).revision).toBe(0)
  })
  it('excludes own-project operations and redacts finance notes at the staff read boundary', async () => {
    const row = await acceptedGrant()
    const queries = await import('@/app/(site)/grants/_lib/queries')
    const session = await import('@/lib/session')
    await store.mutateGrant(
      row.id,
      0,
      {
        kind: 'save_followup',
        title: 'Private next step',
        ownerId: reviewer.id,
        due: now().slice(0, 10),
        waitingOn: 'Staff',
        note: 'Private follow-up',
      },
      reviewer,
    )
    await store.mutateGrant(
      row.id,
      1,
      {
        kind: 'report_payment',
        reference: prefix + '-secret',
        amountMinor: 100000,
        date: now().slice(0, 10),
        evidence: 'https://example.test/private-finance',
        note: 'CONFIDENTIAL-FINANCE-NOTE',
      },
      reviewer,
    )
    vi.mocked(session.getCurrentUser).mockResolvedValue({ ...reviewer, permissions: new Set<Permission>(['grants.review']) })
    const redacted = await queries.readApplication(row.id, true)
    expect(JSON.stringify(redacted)).not.toContain('CONFIDENTIAL-FINANCE-NOTE')
    expect(JSON.stringify(redacted)).not.toContain(prefix + '-secret')
    expect(JSON.stringify(redacted)).not.toContain('https://example.test/private-finance')
    vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
    expect(JSON.stringify(await queries.readApplication(row.id, true))).toContain('CONFIDENTIAL-FINANCE-NOTE')
    await db.projectMember.create({ data: { projectId: row.projectId, userId: reviewer.id, role: 'reader' } })
    expect((await queries.operations('followups')).some((r) => r.id === row.id)).toBe(false)
    expect((await queries.listApplications(true)).some((r) => r.id === row.id)).toBe(false)
    await db.projectMember.delete({ where: { projectId_userId: { projectId: row.projectId, userId: reviewer.id } } })
  })
  it('preserves authorized reconciliation after project archival but blocks applicant changes', async () => {
    const row = await acceptedGrant()
    const result = await store.mutateGrant(
      row.id,
      0,
      {
        kind: 'report_payment',
        reference: prefix + '-archived',
        amountMinor: 100000,
        date: now().slice(0, 10),
        evidence: 'https://example.test/report',
        note: 'External report',
      },
      reviewer,
    )
    let state = (await db.grantApplication.findUniqueOrThrow({ where: { id: row.id } })).state as GrantState
    await store.mutateGrant(
      row.id,
      result.revision,
      {
        kind: 'reconcile_payment',
        paymentId: state.payments[0].id,
        state: 'confirmed',
        evidence: 'https://example.test/settled',
        note: 'Confirmed externally',
      },
      reviewer,
    )
    await db.project.update({ where: { id: row.projectId }, data: { archivedAt: new Date() } })
    await expect(
      store.mutateGrant(row.id, 2, { kind: 'submit_amendment', terms: fields().terms, reason: 'Attempt while archived' }, builder),
    ).rejects.toThrow('archived')
    await store.mutateGrant(
      row.id,
      2,
      {
        kind: 'reconcile_payment',
        paymentId: state.payments[0].id,
        state: 'reversed',
        evidence: 'https://example.test/reversed',
        note: 'Later reversal',
      },
      reviewer,
    )
    state = (await db.grantApplication.findUniqueOrThrow({ where: { id: row.id } })).state as GrantState
    expect(state.payments[0].state).toBe('reversed')
    expect(await db.grantRevision.count({ where: { applicationId: row.id } })).toBe(4)
  })
  it('retains owner-choice history and freezes all submitted round members independently of later edits', async () => {
    const session = await import('@/lib/session')
    vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
    const roundActions = await import('@/app/(site)/grants/_lib/round-actions')
    const row = await acceptedGrant(),
      before = await db.grantRound.findUniqueOrThrow({ where: { id: roundId } })
    expect(
      (
        await roundActions.chooseForRound({
          roundId,
          revision: before.revision,
          applicationId: row.id,
          choice: { disposition: 'call', ownerId: reviewer.id, rationale: 'Owner chooses a call independently of funding' },
        })
      ).ok,
    ).toBe(true)
    expect(
      (
        await roundActions.chooseForRound({
          roundId,
          revision: before.revision + 1,
          applicationId: row.id,
          choice: { disposition: 'feedback', ownerId: reviewer.id, rationale: 'New owner rationale' },
        })
      ).ok,
    ).toBe(true)
    const current = await db.grantRound.findUniqueOrThrow({ where: { id: roundId } })
    const choices = (await import('@/app/(site)/grants/_lib/schemas')).storedRoundChoice
    const choice = choices.parse((current.choices as Record<string, unknown>)[row.id])
    expect(choice.history).toHaveLength(1)
    expect(choice.history[0].disposition).toBe('call')
    const result = await roundActions.snapshotRound({ roundId, revision: current.revision, note: 'Freeze the full review set' })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Snapshot failed')
    const frozen = await db.grantRoundSnapshot.findUniqueOrThrow({ where: { id: result.data.id } })
    const members = (frozen.data as { members: unknown[] }).members
    expect(members.length).toBe(await db.grantApplication.count({ where: { roundId, status: { not: 'draft' } } }))
    expect(members.length).toBeGreaterThan(2)
    const state = structuredClone(row.state) as GrantState
    state.assessment.criteria.c1.score = '0'
    await db.grantApplication.update({ where: { id: row.id }, data: { state: store.json(state) } })
    expect((await db.grantRoundSnapshot.findUniqueOrThrow({ where: { id: frozen.id } })).data).toEqual(frozen.data)
  })
  it('applies the round-wide draft membership conflict to legacy priority writes and their success audits', async () => {
    const { getCurrentUser } = await import('@/lib/session')
    const { roundComparison } = await import('@/app/(site)/grants/_lib/queries')
    const { chooseForRound, snapshotRound } = await import('@/app/(site)/grants/_lib/round-actions')
    const selected = await acceptedGrant(), ownProject = await project()
    const draft = await store.createGrant(ownProject.id, roundId, { ...fields(), projectMilestoneId: ownProject.milestoneId }, builder)
    const readRound = () => db.grantRound.findUniqueOrThrow({ where: { id: roundId } })
    const before = await readRound()
    const auditWhere = { entityId: roundId, actorId: reviewer.id, action: 'grant.round.choice' }
    const auditCount = await db.auditLog.count({ where: auditWhere })
    const input = { roundId, revision: before.revision, applicationId: selected.id,
      choice: { disposition: 'call' as const, ownerId: reviewer.id, rationale: 'Independent priority choice' } }

    vi.mocked(getCurrentUser).mockResolvedValue(user(reviewer.id, ['grants.manage']))
    expect(await chooseForRound(input)).toEqual({ ok: false, error: 'Grant review access is also required' })
    vi.mocked(getCurrentUser).mockResolvedValue(user(reviewer.id, ['grants.review']))
    expect(await chooseForRound(input)).toEqual({ ok: false, error: 'Forbidden' })
    vi.mocked(getCurrentUser).mockResolvedValue(reviewer)
    await db.projectMember.create({ data: { projectId: ownProject.id, userId: reviewer.id, role: 'reader' } })
    try {
      await expect(roundComparison(roundId, undefined, 1, 1)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
      expect(await snapshotRound({ roundId, revision: before.revision, note: 'Freeze' })).toEqual({ ok: false, error: 'A project member cannot freeze their own review round' })
      expect.soft(await chooseForRound(input)).toMatchObject({ ok: false, error: expect.stringContaining('review round') })
      expect.soft(await db.auditLog.count({ where: auditWhere })).toBe(auditCount)
      expect(await readRound()).toEqual(before)
    } finally {
      await db.projectMember.deleteMany({ where: { projectId: ownProject.id, userId: reviewer.id } })
    }

    expect(await chooseForRound({ ...input, applicationId: draft.id })).toEqual({ ok: false, error: 'Application is outside this review set' })
    expect(await chooseForRound(input)).toMatchObject({ ok: true })
    expect(await chooseForRound(input)).toEqual({ ok: false, error: 'Round changed. Refresh before saving.' })
    expect(await readRound()).toMatchObject({ revision: before.revision + 1, choices: { [selected.id]: { ...input.choice, actorId: reviewer.id } } })
    expect(await db.auditLog.count({ where: auditWhere })).toBe(auditCount + 1)
  })
  it('rejects unauthenticated direct action calls and uses the current effective permission set', async () => {
    const session = await import('@/lib/session')
    vi.mocked(session.getCurrentUser).mockResolvedValue(null)
    const row = await acceptedGrant(),
      input = {
        applicationId: row.id,
        revision: 0,
        command: {
          kind: 'report_payment' as const,
          reference: `${prefix}-direct`,
          amountMinor: 100000,
          date: now().slice(0, 10),
          evidence: 'https://example.test/direct',
          note: 'Report',
        },
      }
    expect(await actions.changeApplication(input)).toEqual({ ok: false, error: 'Not signed in' })
    vi.mocked(session.getCurrentUser).mockResolvedValue({ ...reviewer, permissions: new Set<Permission>() })
    expect(await actions.changeApplication(input)).toEqual({ ok: false, error: 'You cannot perform this grant action' })
    vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
    expect(await actions.changeApplication(input)).toEqual({ ok: true, data: { id: row.id, revision: 1 } })
    expect(await db.auditLog.count({ where: { actorId: reviewer.id, entityId: row.id } })).toBe(1)
  })
  it('finds older follow-up and impact cases beyond 100 newer nonmatches without exposing conflicted cases', async () => {
    const session = await import('@/lib/session')
    const { GRANT_PAGE_SIZE, listApplications, operations, roundComparison } = await import('@/app/(site)/grants/_lib/queries')
    const old = await acceptedGrant()
    const state = old.state as GrantState
    const apply = (s: GrantState, command: Parameters<typeof transition>[1]) =>
      transition(s, command, { id: randomUUID(), actorId: reviewer.id, now: now(), projectVersionId: old.projectVersionId })
    const due = addDays(now().slice(0, 10), -1)
    const withFollowup = apply(state, {
      kind: 'save_followup', title: 'Overdue synthetic action', ownerId: reviewer.id, due, waitingOn: 'Applicant', note: 'Synthetic follow-up',
    })
    const actionable = {
      ...withFollowup,
      impactPlan: { ownerId: reviewer.id, metrics: [{ id: 'synthetic-metric', name: 'Demo users', unit: 'users', baseline: 0, target: 3, method: 'Synthetic check' }] },
    }
    await db.grantApplication.update({
      where: { id: old.id }, data: { state: store.json(actionable), updatedAt: new Date('2039-01-01') },
    })
    const newerProjects = []
    for (let i = 0; i < 102; i++) newerProjects.push(await project())
    const [conflicted, ...nonmatching] = newerProjects
    const newer = await db.grantApplication.createManyAndReturn({
      data: newerProjects.map((p) => ({
        roundId, projectId: p.id, projectVersionId: p.versionId, status: 'approved',
        state: store.json(p.id === conflicted.id ? actionable : state),
        updatedAt: new Date('2040-01-01'),
      })),
    })
    applications.push(...newer.map((r) => r.id))
    await db.projectMember.create({ data: { projectId: conflicted.id, userId: reviewer.id, role: 'reader' } })
    expect(nonmatching).toHaveLength(101)
    vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
    const followups = await operations('followups')
    const impact = await operations('impact')
    const excluded = new Set(newer.map((r) => r.id))
    expect.soft(followups.filter((r) => r.id === old.id).map((r) => r.state.followups[0]?.due)).toEqual([due])
    expect.soft(impact.filter((r) => r.id === old.id).map((r) => r.state.impactPlan)).toEqual([actionable.impactPlan])
    expect([...followups, ...impact].some((r) => excluded.has(r.id))).toBe(false)
    const conflicts = newer.find((r) => r.projectId === conflicted.id)!
    const matching = newer.filter((r) => r.id !== conflicts.id).slice(0, GRANT_PAGE_SIZE + 2)
    await db.grantApplication.updateMany({
      where: { id: { in: matching.map((r) => r.id) } },
      data: { state: store.json(actionable), updatedAt: new Date('2040-01-01') },
    })
    const expected = [...matching.map((r) => r.id).sort().reverse(), old.id]
    for (const kind of ['followups', 'impact'] as const) {
      const first = await operations(kind, 1)
      const second = await operations(kind, 2)
      expect(first).toHaveLength(GRANT_PAGE_SIZE + 1)
      expect([...first.slice(0, GRANT_PAGE_SIZE), ...second].map((r) => r.id).slice(0, expected.length)).toEqual(expected)
    }
    const staffFirst = await listApplications(true, 'Synthetic validation project', 1)
    const staffSecond = await listApplications(true, 'Synthetic validation project', 2)
    const staffRows = [...staffFirst.slice(0, GRANT_PAGE_SIZE), ...staffSecond.slice(0, GRANT_PAGE_SIZE)]
    expect(staffRows.map((r) => r.id)).toEqual(newer.filter((r) => r.id !== conflicts.id).map((r) => r.id).sort().reverse().slice(0, 2 * GRANT_PAGE_SIZE))
    await expect(roundComparison(roundId, undefined, 1, 1)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')

    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const applicantPage = await listApplications(false, 'Synthetic validation project', 3)
    expect(applicantPage.map((r) => r.id)).toContain(old.id)

    vi.mocked(session.getCurrentUser).mockResolvedValue({ ...stranger, permissions: new Set<Permission>(['grants.review', 'grants.manage']) })
    const live = await roundComparison(roundId, undefined, 1, 1)
    expect(live.applications.map((r) => r.id)).toEqual(expect.arrayContaining([old.id, ...newer.map((r) => r.id)]))
    const { snapshotRound } = await import('@/app/(site)/grants/_lib/round-actions')
    const snapshot = await snapshotRound({ roundId, revision: live.round!.revision, note: 'Freeze every non-draft member' })
    if (!snapshot.ok) throw new Error(snapshot.error)
    const frozen = await roundComparison(roundId, snapshot.data.id, 1, 1)
    const frozenMembers = (frozen.frozen!.data as { members: { id: string }[] }).members.map((r) => r.id)
    expect(frozenMembers).toEqual(expect.arrayContaining([old.id, ...newer.map((r) => r.id)]))
    expect(frozenMembers).toHaveLength(live.applications.length)

    vi.mocked(session.getCurrentUser).mockResolvedValue(stranger)
    await expect(operations('followups')).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    await expect(operations('impact')).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  })
  it('excludes missing, null, empty and non-array follow-ups before parsing or paging', async () => {
    const session = await import('@/lib/session')
    const { operations } = await import('@/app/(site)/grants/_lib/queries')
    const valid = await acceptedGrant()
    const state = valid.state as GrantState
    const due = addDays(now().slice(0, 10), -1)
    const withFollowup = transition(state, {
      kind: 'save_followup', title: 'Overdue work', ownerId: reviewer.id, due, waitingOn: 'Applicant', note: 'Synthetic fixture',
    }, { id: randomUUID(), actorId: reviewer.id, now: now(), projectVersionId: valid.projectVersionId })
    await db.grantApplication.update({ where: { id: valid.id }, data: { state: store.json(withFollowup), updatedAt: new Date('2041-01-01') } })
    const missing: Partial<GrantState> = { ...state }
    delete missing.followups
    const malformed = [missing, ...[null, [], {}, { 0: withFollowup.followups[0] }, 1, true, '[]'].map((followups) => ({ ...state, followups }))]
    const excluded: string[] = []
    for (const value of malformed) {
      const p = await project()
      const row = await db.grantApplication.create({
        data: { roundId, projectId: p.id, projectVersionId: p.versionId, status: state.status, state: store.json(value), updatedAt: new Date('2042-01-01') },
      })
      applications.push(row.id)
      excluded.push(row.id)
    }
    vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
    const found = await operations('followups')
    expect(found.find((row) => row.id === valid.id)?.state.followups[0]).toMatchObject({ due, state: 'open' })
    expect(found.some((row) => excluded.includes(row.id))).toBe(false)
  })
  it('resolves authorized older rounds and snapshots independently of their selector pages', async () => {
    const session = await import('@/lib/session')
    const { GRANT_PAGE_SIZE, roundComparison } = await import('@/app/(site)/grants/_lib/queries')
    vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
    const olderDate = new Date('2039-01-01')
    const oldRound = await db.grantRound.create({ data: { name: 'Older synthetic round', createdAt: olderDate } })
    const newer = await db.grantRound.createManyAndReturn({
      data: Array.from({ length: 101 }, (_, i) => ({ name: `Newer synthetic round ${i}`, createdAt: new Date('2040-01-01') })),
    })
    try {
      const snapshots = await db.grantRoundSnapshot.createManyAndReturn({
        data: Array.from({ length: 102 }, (_, i) => ({
          roundId: oldRound.id, number: i + 1, actorId: reviewer.id, note: `Synthetic snapshot ${i + 1}`,
          data: { members: [], choices: {} },
        })),
      })
      const first = snapshots.find((snapshot) => snapshot.number === 1)!
      const { Children, isValidElement } = await import('react')
      const { renderToStaticMarkup } = await import('react-dom/server')
      const { Pager } = await import('@/components/layout/pager')
      const { default: RoundsPage } = await import('@/app/admin/grants/rounds/page')
      const implicit = await roundComparison(undefined, undefined, 1, 2)
      const page = await RoundsPage({ searchParams: Promise.resolve({ snapshotPage: '2' }) })
      const pagerContainer = Children.toArray(page.props.children).find((node) =>
        isValidElement<{ children: unknown }>(node) && isValidElement(node.props.children) && node.props.children.type === Pager,
      )
      expect(isValidElement(pagerContainer)).toBe(true)
      const nextHref = renderToStaticMarkup(pagerContainer).match(/href="([^"]+)"/)?.[1].replaceAll('&amp;', '&')
      expect(nextHref).toBeDefined()
      const next = new URLSearchParams(nextHref)
      expect(next.get('page')).toBe('2')
      expect(next.get('snapshotPage')).toBe('2')
      expect(next.get('round')).toBe(implicit.round?.id)
      const continued = await roundComparison(next.get('round') ?? undefined, undefined, 2, 2)
      expect(continued.round?.id).toBe(implicit.round?.id)

      const selected = await roundComparison(oldRound.id, first.id, 1, 1)
      expect(selected.round?.id).toBe(oldRound.id)
      expect(selected.rounds).toHaveLength(GRANT_PAGE_SIZE + 1)
      expect(selected.rounds.map((r) => r.id)).not.toContain(oldRound.id)
      expect(selected.frozen?.note).toBe(first.note)
      expect(selected.snapshots.map((r) => r.number)).toEqual(Array.from({ length: GRANT_PAGE_SIZE + 1 }, (_, i) => 102 - i))
      const later = await roundComparison(oldRound.id, first.id, 3, 3)
      expect(later.rounds.map((r) => r.id)).toContain(oldRound.id)
      expect(later.snapshots.map((r) => r.number)).toEqual([2, 1])
      await expect(roundComparison(newer[0].id, first.id, 1, 1)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    } finally {
      await db.grantRoundSnapshot.deleteMany({ where: { roundId: oldRound.id } })
      await db.grantRound.deleteMany({ where: { id: { in: [oldRound.id, ...newer.map((r) => r.id)] } } })
    }
  })
  it('saves and submits a short draft atomically, without changing the roadmap', async () => {
    vi.stubEnv('GRANTS_SHORT_INTAKE_ENABLED', 'true')
    const session = await import('@/lib/session')
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const p = await project()
    const originalRoadmap = await db.projectMilestone.findMany({ where: { projectId: p.id } })
    const draft = { intakeVersion: 2 as const, amountMinor: null, summary: '', milestone: null }
    vi.mocked(session.getCurrentUser).mockResolvedValue(stranger)
    expect(await actions.createApplication({ projectId: p.id, roundId, answers: draft })).toMatchObject({ ok: false })
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const created = await actions.createApplication({ projectId: p.id, roundId, answers: draft })
    if (!created.ok) throw new Error(created.error)
    expect(await actions.createApplication({ projectId: p.id, roundId, answers: draft }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/already has an application/i) })
    const id = created.data.id
    applications.push(id)
    const proposal = {
      ...draft, amountMinor: 125000, summary: 'Publish a demo that replays Avalanche events',
      milestone: { source: 'application' as const, title: 'Release the replay demo', due: fields().terms.due, evidence: 'A demo recording showing a replay and its test results' },
    }
    const input = { applicationId: id, revision: 0, command: { kind: 'submit_application' as const, confirm: true as const, shortAnswers: proposal } }
    const read = await import('@/app/(site)/grants/_lib/queries')
    expect((await read.readApplication(id, false)).state.answers).toEqual(draft)
    await db.grantRound.update({ where: { id: roundId }, data: { published: false } })
    try {
      expect(await actions.changeApplication(input)).toMatchObject({ ok: false, error: expect.stringMatching(/closed/i) })
      expect((await read.readApplication(id, false)).state.answers).toEqual(draft)
      expect(await db.grantRevision.count({ where: { applicationId: id } })).toBe(1)
    } finally {
      await db.grantRound.update({ where: { id: roundId }, data: { published: true } })
    }
    expect(await actions.changeApplication(input)).toMatchObject({ ok: true, data: { revision: 1 } })
    expect(await db.projectMilestone.findMany({ where: { projectId: p.id } })).toEqual(originalRoadmap)
    const row = await db.grantApplication.findUniqueOrThrow({ where: { id } })
    expect(row.state).toMatchObject({ status: 'submitted', applications: [{ answers: proposal, projectVersionId: p.versionId }] })
    expect(await actions.changeApplication(input)).toMatchObject({ ok: false, error: expect.stringMatching(/changed/i) })
  })

  it('rejects malformed short commitments and requires the reviewed roadmap title, date and eligibility', async () => {
    vi.stubEnv('GRANTS_SHORT_INTAKE_ENABLED', 'true')
    const session = await import('@/lib/session')
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const p = await project(), other = await project()
    const proposed = {
      intakeVersion: 2 as const, amountMinor: 1000000, summary: 'Publish the working demo',
      milestone: { source: 'roadmap' as const, id: p.milestoneId, title: fields().terms.title, due: fields().terms.due, evidence: 'A demo walkthrough and test output' },
    }
    const submit = (answers: typeof proposed) => actions.createApplication({ projectId: p.id, roundId, answers, submit: true, confirm: true })
    for (const answers of [
      { ...proposed, amountMinor: 101 }, { ...proposed, amountMinor: 1000100 }, { ...proposed, summary: ' ' },
      { ...proposed, milestone: { ...proposed.milestone, evidence: ' ' } },
      { ...proposed, milestone: { ...proposed.milestone, due: '2026-02-30' } },
    ]) expect(await submit(answers)).toMatchObject({ ok: false })
    expect(await submit({ ...proposed, milestone: { ...proposed.milestone, id: other.milestoneId } })).toMatchObject({ ok: false, error: expect.stringMatching(/review.*commitment/i) })
    const created = await actions.createApplication({ projectId: p.id, roundId, answers: proposed })
    if (!created.ok) throw new Error(created.error)
    const id = created.data.id
    applications.push(id)
    const reviewed = { applicationId: id, revision: 0, command: { kind: 'submit_application' as const, confirm: true as const, shortAnswers: proposed } }
    for (const data of [{ title: 'Edited title' }, { title: proposed.milestone.title, targetDate: addDays(proposed.milestone.due, 1) }, { targetDate: proposed.milestone.due, status: 'completed' }]) {
      await db.projectMilestone.update({ where: { id: p.milestoneId }, data })
      expect(await actions.changeApplication(reviewed)).toMatchObject({ ok: false, error: expect.stringMatching(/review.*commitment/i) })
      expect(await db.grantApplication.findUniqueOrThrow({ where: { id }, select: { state: true, revision: true } })).toMatchObject({ revision: 0, state: { answers: proposed } })
    }
    expect(await db.projectVersion.findUniqueOrThrow({ where: { id: p.versionId }, select: { sealedAt: true } })).toEqual({ sealedAt: null })
    await db.projectMilestone.update({
      where: { id: p.milestoneId },
      data: { title: proposed.milestone.title, targetDate: proposed.milestone.due, status: 'planned' },
    })
    expect(await actions.changeApplication(reviewed)).toMatchObject({ ok: true, data: { revision: 1 } })
    await db.projectMilestone.update({ where: { id: p.milestoneId }, data: { title: 'Later roadmap edit' } })
    expect(await db.grantApplication.findUniqueOrThrow({ where: { id }, select: { state: true } }))
      .toMatchObject({ state: { applications: [{ answers: proposed, projectVersionId: p.versionId }] } })
  })

  it('keeps short intake approval gates and exposes only released award terms to the applicant', async () => {
    vi.stubEnv('GRANTS_SHORT_INTAKE_ENABLED', 'true')
    const session = await import('@/lib/session')
    const p = await project()
    const proposal = {
      intakeVersion: 2 as const, amountMinor: 125000, summary: 'Publish the working demo',
      milestone: { source: 'application' as const, title: 'Publish a reproducible demo', due: fields().terms.due, evidence: 'A recording and the test results' },
    }
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const created = await actions.createApplication({ projectId: p.id, roundId, answers: proposal, submit: true, confirm: true })
    if (!created.ok) throw new Error(created.error)
    const id = created.data.id
    applications.push(id)
    vi.stubEnv('GRANTS_SHORT_INTAKE_ENABLED', 'false')
    const award = { ...fields().terms, verifier: 'Private verifier', hypothesis: 'Private hypothesis', limits: 'Private risk limits' }
    const command = {
      kind: 'record_decision' as const, outcome: 'approved' as const, terms: award,
      ownerId: reviewer.id, rationale: 'Private rationale', authority: 'Private authority', budget: 'Private budget', publicNote: 'Published note',
    }
    const approve = (revision: number) => ({ applicationId: id, revision, command })
    vi.mocked(session.getCurrentUser).mockResolvedValue({ ...reviewer, permissions: new Set<Permission>(['grants.review']) })
    expect(await actions.changeApplication(approve(0))).toMatchObject({ ok: false })
    vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
    expect(await actions.changeApplication(approve(0))).toMatchObject({ ok: false, error: expect.stringMatching(/assessment/i) })
    const ass = initialState(fields()).assessment
    for (const key of criterionIds) ass.criteria[key] = { score: '2', basis: 'E', source: 'Checked', rationale: 'Pass' }
    for (const key of clearanceIds) ass.clearances[key] = { state: 'pass', evidence: 'Checked' }
    expect(await actions.changeApplication({ applicationId: id, revision: 0, command: { kind: 'save_assessment', assessment: ass } }))
      .toMatchObject({ ok: true })
    expect(await actions.changeApplication({ ...approve(1), command: { ...command, budget: '' } }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/budget/i) })
    expect(await actions.changeApplication({ ...approve(1), command: { ...command, terms: { ...award, verifier: '' } } }))
      .toMatchObject({ ok: false })
    expect(await actions.changeApplication(approve(1))).toMatchObject({ ok: true })
    const { readApplication } = await import('@/app/(site)/grants/_lib/queries')
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const read = await readApplication(id, false)
    expect(read.state.answers).toEqual(proposal)
    expect(read.state.terms[0].terms).toEqual({
      title: award.title, amountMinor: award.amountMinor, acceptance: award.acceptance, due: award.due, maintainer: award.maintainer,
    })
    expect(JSON.stringify(read.state)).not.toMatch(/Private (?:verifier|hypothesis|risk|rationale|authority|budget)|bounded_pilot/)
    expect(read.state.decisions[0].publicNote).toBe('Published note')
    expect(await actions.changeApplication({ applicationId: id, revision: 2, command: { kind: 'confirm_terms', confirm: true } }))
      .toMatchObject({ ok: true })
    expect(await actions.changeApplication({
      applicationId: id, revision: 3,
      command: { kind: 'submit_amendment', terms: { ...read.state.terms[0].terms, title: 'Amended scope' }, reason: 'Maintain the same evidence checks' },
    })).toMatchObject({ ok: true })
    const saved = (await db.grantApplication.findUniqueOrThrow({ where: { id } })).state as GrantState
    expect(saved.amendments[0].terms).toMatchObject({ title: 'Amended scope', route: award.route, verifier: award.verifier })
  })

  it('keeps legacy cents and cost rows when a draft is read, edited or submitted', async () => {
    const session = await import('@/lib/session')
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const p = await project()
    const base = fields()
    const legacy = { ...base, projectMilestoneId: p.milestoneId,
      terms: { ...base.terms, amountMinor: 125050 },
      costs: [{ title: 'Prototype', amountMinor: 100050 }, { title: 'Testing', amountMinor: 25000 }],
    }
    const created = await actions.createApplication({ projectId: p.id, roundId, answers: legacy })
    if (!created.ok) throw new Error(created.error)
    const { id } = created.data
    applications.push(id)
    const { readApplication } = await import('@/app/(site)/grants/_lib/queries')
    expect((await readApplication(id, false)).state.answers).toEqual(legacy)
    await expect(store.mutateGrant(id, 0, {
      kind: 'save_application', answers: { intakeVersion: 2, amountMinor: null, summary: '', milestone: null },
    }, builder)).rejects.toThrow(/original form/i)
    const edited = { ...legacy, outcome: 'Updated legacy funded work' }
    await store.mutateGrant(id, 0, { kind: 'save_application', answers: edited }, builder)
    await store.mutateGrant(id, 1, { kind: 'submit_application', confirm: true }, builder)
    expect((await readApplication(id, false)).state.applications[0].answers).toEqual(edited)
  })

  it('requires reviewed short answers to submit a complete v2 draft and blocks stale writes when disabled', async () => {
    const session = await import('@/lib/session')
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const p = await project(), stale = await project()
    const proposed = {
      intakeVersion: 2 as const, amountMinor: 125000, summary: 'Publish the working demo',
      milestone: { source: 'application' as const, title: 'Publish the demo', due: fields().terms.due, evidence: 'A recording and passing test results' },
    }
    vi.stubEnv('GRANTS_SHORT_INTAKE_ENABLED', 'true')
    const created = await actions.createApplication({ projectId: p.id, roundId, answers: proposed })
    if (!created.ok) throw new Error(created.error)
    const id = created.data.id
    applications.push(id)
    const before = await db.grantApplication.findUniqueOrThrow({ where: { id } })
    await expect.soft(store.mutateGrant(id, 0, { kind: 'submit_application', confirm: true }, builder))
      .rejects.toThrow(/reviewed/i)
    expect.soft(await db.grantApplication.findUniqueOrThrow({ where: { id } })).toEqual(before)
    expect.soft(await db.grantRevision.count({ where: { applicationId: id } })).toBe(1)
    vi.stubEnv('GRANTS_SHORT_INTAKE_ENABLED', 'false')
    expect.soft(await actions.createApplication({ projectId: stale.id, roundId, answers: proposed }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/unavailable/i) })
    const staleRows = await db.grantApplication.findMany({ where: { projectId: stale.id } })
    applications.push(...staleRows.map((row) => row.id))
    expect.soft(staleRows).toHaveLength(0)
    const { readApplication } = await import('@/app/(site)/grants/_lib/queries')
    expect.soft((await readApplication(id, false)).state.answers).toEqual(proposed)
    await expect.soft(store.mutateGrant(id, 0, { kind: 'save_application', answers: proposed }, builder)).rejects.toThrow(/unavailable/i)
    await expect.soft(store.mutateGrant(id, 0, { kind: 'submit_application', confirm: true, shortAnswers: proposed }, builder)).rejects.toThrow(/unavailable/i)
    expect(await db.grantApplication.findUniqueOrThrow({ where: { id } })).toEqual(before)
    expect(await db.grantRevision.count({ where: { applicationId: id } })).toBe(1)
  })


  it('versions new submissions and preserves the pinned, authorized milestone-first award and payment sequence when enrollment turns off', async () => {
    vi.stubEnv('GRANTS_SHORT_INTAKE_ENABLED', 'true')
    vi.stubEnv('GRANTS_MILESTONE_FIRST_ENABLED', 'true')
    const p = await project()
    const original = {
      intakeVersion: 2 as const, amountMinor: 125000, summary: 'Publish the demo',
      milestone: { source: 'application' as const, title: 'Publish dashboard', due: fields().terms.due, evidence: 'A demo and test results' },
    }
    const { id } = await store.createGrant(p.id, roundId, original, builder)
    applications.push(id)
    const read = () => db.grantApplication.findUniqueOrThrow({ where: { id } })
    expect((await read()).state).toMatchObject({ version: 2, status: 'draft' })
    await store.mutateGrant(id, 0, { kind: 'submit_application', shortAnswers: original, confirm: true }, builder)
    const first = await read()
    expect(first.state).toMatchObject({ version: 3, milestoneClearance: null })
    vi.stubEnv('GRANTS_MILESTONE_FIRST_ENABLED', 'false')
    const another = await project()
    const legacy = await store.createGrant(another.id, roundId, original, builder, true)
    applications.push(legacy.id)
    expect((await db.grantApplication.findUniqueOrThrow({ where: { id: legacy.id } })).state).toMatchObject({ version: 2 })
    const clearance = { kind: 'clear_milestone', confirm: true } as const
    await expect(store.mutateGrant(id, 1, clearance, { ...reviewer, permissions: new Set<Permission>(['grants.review']) })).rejects.toThrow()
    await expect(store.mutateGrant(id, 1, clearance, { ...builder, permissions: reviewer.permissions })).rejects.toThrow()
    await store.mutateGrant(id, 1, clearance, reviewer)
    await expect(store.mutateGrant(id, 1, clearance, reviewer)).rejects.toThrow(/changed/i)
    expect((await read()).state).toMatchObject({ status: 'submitted', terms: [], payments: [], milestoneClearance: { projectVersionId: first.projectVersionId } })
    const delivered = { kind: 'submit_delivery', release: 'https://example.test/release', reproduction: 'https://example.test/tests', note: 'Synthetic test result' } as const
    await expect(store.mutateGrant(id, 2, delivered, stranger)).rejects.toThrow()
    await store.mutateGrant(id, 2, delivered, builder)
    const evidence = ((await read()).state as GrantState).deliveries[0]
    const verify = { kind: 'review_delivery', deliveryId: evidence.id, outcome: 'accepted', inspected: true,
      reproduced: true, matches: true, note: 'Released verification', evidence: 'Private verification reference' } as const
    await expect(store.mutateGrant(id, 3, verify, { ...reviewer, permissions: new Set<Permission>(['grants.review','grants.decide']) })).rejects.toThrow()
    await store.mutateGrant(id, 3, verify, reviewer)
    const pay = { kind: 'report_payment', reference: 'payment-' + randomUUID(), amountMinor: 125000,
      date: now().slice(0,10), evidence: 'https://example.test/payment', note: 'Offline synthetic record' } as const
    await expect(store.mutateGrant(id, 4, pay, reviewer)).rejects.toThrow(/award/i)
    expect(await db.grantPaymentReference.findUnique({ where: { reference: pay.reference } })).toBeNull()
    const assessment = initialState(fields()).assessment
    for (const key of criterionIds) assessment.criteria[key] = { score: '2', basis: 'E', source: 'Checked', rationale: 'Pass' }
    for (const key of clearanceIds) assessment.clearances[key] = { state: 'pass', evidence: 'Checked' }
    assessment.clearances.rights = { state: 'unresolved', evidence: '' }
    await store.mutateGrant(id, 4, { kind: 'save_assessment', assessment }, reviewer)
    const award = {
      kind: 'record_decision', outcome: 'approved',
      terms: { ...fields().terms, title: original.milestone.title, acceptance: original.milestone.evidence, due: original.milestone.due, amountMinor: 125000 },
      ownerId: reviewer.id, rationale: 'Private rationale', authority: 'Private authority', budget: 'Private budget', publicNote: 'Award issued',
    } as const
    await expect(store.mutateGrant(id, 5, award, reviewer)).rejects.toThrow(/rights/i)
    const verified = (await read()).state as GrantState
    const next = await db.projectVersion.create({ data: { projectId: p.id, number: 2, name: 'New unrelated working draft',
      shortDescription: 'Different project version', fullDescription: 'Different live draft', createdById: builder.id } })
    await db.project.update({ where: { id: p.id }, data: { currentVersionId: next.id } })
    const question = { kind: 'request_evidence', title: 'Confirm publishing rights', body: 'Who approved the cleared milestone?' } as const
    await expect(store.mutateGrant(id, 5, question, stranger)).rejects.toThrow()
    await expect(store.mutateGrant(id, 5, question, { ...builder, permissions: reviewer.permissions })).rejects.toThrow()
    const session = await import('@/lib/session')
    vi.mocked(session.getCurrentUser).mockResolvedValue(reviewer)
    expect(await actions.changeApplication({ applicationId: id, revision: 5, command: question })).toMatchObject({ ok: true })
    await expect(store.mutateGrant(id, 6, award, reviewer)).rejects.toThrow(/open evidence/i)
    const current = (await read()).state as GrantState
    const reply = { kind: 'answer_request', requestId: current.requests.at(-1)!.id, reply: 'The maintainers approved this exact milestone.' } as const
    await expect(store.mutateGrant(id, 5, reply, builder)).rejects.toThrow(/changed/i)
    await expect(store.mutateGrant(id, 6, reply, stranger)).rejects.toThrow()
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    expect(await actions.changeApplication({ applicationId: id, revision: 6, command: reply })).toMatchObject({ ok: true })
    const answered = (await read()).state as GrantState
    expect(answered.assessmentVersionId).toBeNull()
    expect(answered.applications).toEqual(verified.applications)
    expect(answered.deliveries).toEqual(verified.deliveries)
    expect(answered.version === 3 && answered.milestoneClearance).toEqual(verified.version === 3 && verified.milestoneClearance)
    expect((await db.projectVersion.findUniqueOrThrow({ where: { id: next.id } })).sealedAt).toBeNull()
    expect(await db.auditLog.count({ where: { entityId: id, action: { in: ['grant.request_evidence', 'grant.answer_request'] } } })).toBe(2)
    await expect(store.mutateGrant(id, 7, award, reviewer)).rejects.toThrow(/assessment/i)
    assessment.clearances.rights = { state: 'pass', evidence: 'Maintainer confirmed the rights in the reply' }
    await store.mutateGrant(id, 7, { kind: 'save_assessment', assessment }, reviewer)
    await store.mutateGrant(id, 8, award, reviewer)
    await expect(store.mutateGrant(id, 9, pay, { ...reviewer, permissions: new Set<Permission>(['grants.review','grants.decide']) })).rejects.toThrow()
    await store.mutateGrant(id, 9, pay, reviewer)
    await expect(store.mutateGrant(id, 10, pay, reviewer)).rejects.toThrow()
    const paymentId = ((await read()).state as GrantState).payments[0].id
    await store.mutateGrant(id, 10, { kind: 'reconcile_payment', paymentId, state: 'confirmed',
      evidence: 'https://example.test/confirmed', note: 'Confirmed synthetic only' }, reviewer)
    const receipts = await db.grantRevision.findMany({ where: { applicationId: id }, orderBy: { number: 'asc' }, select: { kind: true } })
    expect(receipts.map((receipt) => receipt.kind)).toEqual(['create','submit_application','clear_milestone','submit_delivery','review_delivery',
      'save_assessment','request_evidence','answer_request','save_assessment','record_decision','report_payment','reconcile_payment'])
    expect((await read()).projectVersionId).toBe(first.projectVersionId)
  })

  it('projects the same current recommendation in list and detail after a pinned clarification', async () => {
    const { listApplications, readApplication } = await import('@/app/(site)/grants/_lib/queries')
    const session = await import('@/lib/session')
    const p = await project()
    const caseName = 'Synthetic pinned clarification status'
    await db.projectVersion.update({ where: { id: p.versionId }, data: { name: caseName } })
    const proposal = {
      intakeVersion: 2 as const, amountMinor: 125000, summary: 'Publish the demo',
      milestone: { source: 'application' as const, title: 'Publish dashboard', due: fields().terms.due, evidence: 'A demo and test results' },
    }
    const apply = (state: GrantState, command: Parameters<typeof transition>[1]) => transition(state, command, {
      id: randomUUID(), actorId: reviewer.id, now: now(), projectVersionId: p.versionId, milestoneFirst: true,
    })
    const assessment = initialState(fields()).assessment
    const recommend = { kind: 'release_review_status', status: 'approval_pending' } as const
    let state = apply(initialState(proposal), { kind: 'submit_application', shortAnswers: proposal, confirm: true })
    state = apply(state, { kind: 'clear_milestone', confirm: true })
    state = apply(apply(state, { kind: 'save_assessment', assessment }), recommend)
    state = apply(state, { kind: 'request_evidence', title: 'Publishing rights', body: 'Confirm rights for the same scope' })
    const row = await db.grantApplication.create({
      data: { projectId: p.id, projectVersionId: p.versionId, roundId, status: state.status, state },
    })
    applications.push(row.id)
    vi.mocked(session.getCurrentUser).mockResolvedValue(builder)
    const check = async (status: 'in_review' | 'approval_pending', updateRequested: boolean) => {
      expect((await listApplications(false, caseName)).find((item) => item.id === row.id)?.applicantStatus)
        .toEqual({ status, updateRequested })
      const detail = await readApplication(row.id, false)
      if (detail.staff) throw new Error('Expected the applicant projection')
      expect(detail.state.applicantStatus).toEqual({ status, updateRequested })
      return detail.state
    }
    await check('approval_pending', true)
    await store.mutateGrant(row.id, 0, { kind: 'answer_request', requestId: state.requests[0].id, reply: 'Publishing rights confirmed' }, builder)
    const answered = await check('in_review', false)
    expect(answered.statusReleases).toEqual([{ id: state.statusReleases[0].id, at: state.statusReleases[0].at, status: 'approval_pending' }])
    expect(answered.applications.map((item) => item.id)).toEqual(state.applications.map((item) => item.id))
    await expect(store.mutateGrant(row.id, 1, recommend, reviewer)).rejects.toThrow(/reassess/i)
    await store.mutateGrant(row.id, 1, { kind: 'save_assessment', assessment }, reviewer)
    await check('in_review', false)
    await store.mutateGrant(row.id, 2, recommend, reviewer)
    const released = await check('approval_pending', false)
    expect(released.statusReleases).toHaveLength(2)
  })
})
