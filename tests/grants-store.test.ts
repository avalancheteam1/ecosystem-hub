import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
    return { id: p.id, versionId: version.id }
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
    await db.project.updateMany({ where: { id: { in: projects } }, data: { currentVersionId: null } })
    await db.projectMember.deleteMany({ where: { projectId: { in: projects } } })
    await db.projectVersion.deleteMany({ where: { projectId: { in: projects } } })
    await db.project.deleteMany({ where: { id: { in: projects } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.$disconnect()
  })
  it('seals and pins the real project version atomically on submission', async () => {
    const p = await project(),
      created = await store.createGrant(p.id, roundId, fields(), builder)
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
    const row = await store.createGrant(p.id, roundId, fields(), builder, true)
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
})
