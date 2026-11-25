import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { CurrentUser } from '@/lib/session'
import type { Permission } from '@/lib/permissions'
import { answers, criterionIds, clearanceIds, type GrantState } from '@/app/(site)/grants/_lib/schemas'
import { addDays, initialState, transition } from '@/app/(site)/grants/_lib/rules'

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
    await db.$disconnect()
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
  it('US-1 requires pinned demo proof only for continuous submissions and preserves the saved draft on refusal', async () => {
    const session = await import('@/lib/session')
    const { readApplication } = await import('@/app/(site)/grants/_lib/queries')
    const p = await project()
    const legacyProject = await project()
    const legacy = await store.createGrant(legacyProject.id, roundId, { ...fields(), projectMilestoneId: legacyProject.milestoneId }, builder)
    applications.push(legacy.id)
    const shortAnswers = {
      intakeVersion: 2 as const,
      amountMinor: 10000,
      summary: 'Finish the prototype quickstart',
      milestone: { source: 'application' as const, title: 'Publish quickstart', due: fields().terms.due, evidence: 'Replay results' },
    }
    const submit = { kind: 'submit_application' as const, confirm: true as const, shortAnswers }
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
      const saved = await store.mutateGrant(id, 0, { kind: 'save_application', answers: shortAnswers }, builder)
      await expect(store.mutateGrant(id, saved.revision, submit, builder)).rejects.toThrow('demo link')
      expect(await readApplication(id, false)).toMatchObject({ revision: 1, state: { status: 'draft', answers: shortAnswers } })
      expect((await db.projectVersion.findUniqueOrThrow({ where: { id: p.versionId } })).sealedAt).toBeNull()
      await db.featureFlag.update({ where: { key: 'miniGrantsIntake' }, data: { enabled: false } })
      await expect(store.mutateGrant(id, saved.revision, submit, builder)).rejects.toThrow('paused')
      await db.featureFlag.update({ where: { key: 'miniGrantsIntake' }, data: { enabled: true } })
      await db.projectVersion.update({ where: { id: p.versionId }, data: { demoLinks: ['https://example.test/demo'] } })
      await expect(store.mutateGrant(id, saved.revision, submit, builder)).resolves.toMatchObject({ revision: 2 })
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
