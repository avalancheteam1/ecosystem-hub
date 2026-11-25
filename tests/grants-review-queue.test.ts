import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Permission } from '@/lib/permissions'
import type { CurrentUser } from '@/lib/session'
import { initialState, planAwardScope, transition } from '@/app/(site)/grants/_lib/rules'
import { clearanceIds, criterionIds, draftAnswers, planSubmission, shortSubmission, type GrantState } from '@/app/(site)/grants/_lib/schemas'
import { parseReviewQueue, type ReviewQueueAction } from '@/app/(site)/grants/_lib/review-queue'

const database = process.env.GRANTS_TEST_DATABASE_URL
if (database) {
  const url = new URL(database)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test'))
    throw new Error('Grant queue tests require a localhost database ending in _test')
  process.env.DATABASE_URL = database
}

const { getAuthState } = vi.hoisted(() => ({ getAuthState: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-pathname': '/admin/grants' }) }))
vi.mock('@/lib/session', () => ({ getAuthState }))
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))

describe('US-5 AC8 review queue URL', () => {
  it('parses the same filters and page for either view, accepting only defined values', () => {
    expect(parseReviewQueue({ q: ['  Synthetic  ', 'ignored'], action: ['applicant'], view: 'kanban', page: '2' }))
      .toEqual({ q: 'Synthetic', action: 'applicant', view: 'kanban', page: 2 })
    expect(parseReviewQueue({ action: '__proto__', view: 'other', page: '-2' }))
      .toEqual({ q: undefined, action: undefined, view: 'list', page: 1 })
  })
})

describe.skipIf(!database)('US-5 AC8 review queue on isolated Postgres', () => {
  const prefix = `queue-${randomUUID()}`
  const date = new Date('2026-11-25T12:00:00Z')
  const reviewer: CurrentUser = {
    id: `${prefix}-reviewer`, name: 'Synthetic reviewer', email: `${prefix}-reviewer@example.test`, image: null,
    permissions: new Set(['grants.review']), isSuperAdmin: false, hasSecondFactor: false, superAdminNeedsSecondFactor: false,
  }
  const reader = { ...reviewer, permissions: new Set<Permission>() }
  const ownerId = `${prefix}-owner`
  const oldId = `${prefix}-waiting`
  const roundId = `${prefix}-round`
  const terms = {
    title: 'Synthetic milestone', acceptance: 'Reproducible release', amountMinor: 1000,
    due: '2026-12-30', maintainer: 'Synthetic team', verifier: 'Independent verifier',
    route: 'bounded_pilot', hypothesis: 'Independent adoption', limits: 'Testnet only',
  } as const
  const draft = initialState(draftAnswers.parse({
    problem: 'Synthetic problem', whyGrant: 'Synthetic grant', outcome: 'Synthetic outcome', capability: 'Synthetic capability',
    funding: 'No overlap', maintenance: 'Synthetic team', risks: 'Dependencies', costs: [{ title: 'Work', amountMinor: 1000 }], terms,
  }))
  const apply = (s: Parameters<typeof transition>[0], command: Parameters<typeof transition>[1]) =>
    transition(s, command, { id: randomUUID(), actorId: reviewer.id, now: date.toISOString(), projectVersionId: oldId, milestoneFirst: true })
  const submitted = apply(draft, { kind: 'submit_application', confirm: true })
  const waiting = apply(submitted, { kind: 'request_evidence', title: 'Reproduction', body: 'Private synthetic note' })
  const deferred = apply(submitted, {
    kind: 'record_decision', outcome: 'deferred', terms: null, rationale: 'Private rationale',
    publicNote: 'Awaiting follow-up', ownerId: reviewer.id, budget: '', authority: 'Synthetic committee',
  })
  const shortAnswers = shortSubmission.parse({
    intakeVersion: 2, amountMinor: terms.amountMinor, summary: 'Synthetic funded work',
    milestone: { source: 'application', title: terms.title, due: terms.due, evidence: terms.acceptance },
  })
  let db: typeof import('@/lib/db')['prisma']
  let read: typeof import('@/app/(site)/grants/_lib/review-queue-queries')['readReviewQueue']

  beforeAll(async () => {
    db = (await import('@/lib/db')).prisma
    read = (await import('@/app/(site)/grants/_lib/review-queue-queries')).readReviewQueue
    await db.user.createMany({ data: [reviewer.id, ownerId].map((id) => ({ id, name: 'Synthetic account', email: `${id}@example.test` })) })
    await db.grantRound.create({ data: { id: roundId, name: 'Synthetic round' } })
    const fixtures = [
      ...Array.from({ length: 52 }, (_, i) => ({ id: `${prefix}-${String(i).padStart(2, '0')}`, state: submitted })),
      { id: `${prefix}-deferred`, state: deferred },
      { id: oldId, state: waiting },
      { id: `${prefix}-own`, state: waiting },
      { id: `${prefix}-draft`, state: draft },
    ]
    await db.project.createMany({ data: fixtures.map(({ id }) => ({ id, slug: id, ownerId })) })
    await db.projectMember.create({ data: { projectId: `${prefix}-own`, userId: reviewer.id, role: 'reader' } })
    await db.projectVersion.createMany({ data: fixtures.map(({ id }) => ({ id, projectId: id, number: 1,
      name: `${prefix} Synthetic ${id === oldId ? 'Waiting' : id.slice(prefix.length + 1)}`,
      shortDescription: 'Synthetic project', fullDescription: 'Synthetic project', techDescription: 'Synthetic project', maturity: 'prototype',
    })) })
    await db.grantApplication.createMany({ data: fixtures.map(({ id, state }) => ({ id, roundId,
      projectId: id, projectVersionId: id, status: state.status, state: state as Prisma.InputJsonValue,
      updatedAt: id === oldId ? new Date(date.getTime() - 1) : date,
    })) })
  })

  afterAll(async () => {
    if (!db) return
    await db.$transaction([
      db.grantApplication.deleteMany({ where: { project: { ownerId } } }),
      db.grantRound.deleteMany({ where: { id: roundId } }),
      db.project.deleteMany({ where: { ownerId } }),
      db.user.deleteMany({ where: { id: { in: [reviewer.id, ownerId] } } }),
    ])
  })

  it('excludes drafts and every membership role, and finds older matching cases before pagination', async () => {
    getAuthState.mockResolvedValue({ status: 'signed-in', user: reviewer })
    const first = await read({ q: prefix, page: 1 })
    const second = await read({ q: prefix, page: 2 })
    expect(first.rows).toHaveLength(50)
    expect(first.hasMore).toBe(true)
    expect(second.hasMore).toBe(false)
    const rows = [...first.rows, ...second.rows]
    expect(rows).toHaveLength(54)
    expect(new Set(rows.map((row) => row.id)).size).toBe(54)
    expect(rows.at(-1)).toMatchObject({ id: oldId, nextAction: 'applicant' })
    expect(rows[0]).toMatchObject({ id: `${prefix}-deferred`, nextAction: 'inactive' })
    const filtered = await read({ q: `${prefix.toUpperCase()} synthetic`, action: 'applicant', page: 1 })
    expect(filtered.rows.map((row) => row.id)).toEqual([oldId])
    expect(filtered.hasMore).toBe(false)
    expect(Object.keys(filtered.rows[0]).sort()).toEqual(['id', 'maturity', 'name', 'nextAction', 'round', 'status', 'updatedAt'])
    expect(JSON.stringify(filtered)).not.toContain('Private synthetic note')
    expect(await read({ q: `${prefix} no matches`, action: 'applicant', page: 1 })).toEqual({ rows: [], hasMore: false })
  })

  it('refuses unauthorized reads even when a matching identifier is known', async () => {
    getAuthState.mockResolvedValue({ status: 'signed-in', user: reader })
    await expect(read({ q: prefix, page: 1 })).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
  })

  it('reclassifies on reload after a reply and keeps held cases out of active lanes', async () => {
    getAuthState.mockResolvedValue({ status: 'signed-in', user: reviewer })
    const answered = apply(waiting, { kind: 'answer_request', requestId: waiting.requests[0].id, reply: 'Synthetic reply' })
    await db.grantApplication.update({ where: { id: oldId }, data: { state: answered as Prisma.InputJsonValue } })
    const query = { q: `${prefix} Synthetic Waiting`, page: 1 }
    expect((await read({ ...query, action: 'applicant' })).rows).toHaveLength(0)
    expect((await read({ ...query, action: 'review' })).rows).toMatchObject([{ id: oldId, nextAction: 'review' }])
  })

  it('moves a milestone-first case from clearance to evidence, verification and decision', async () => {
    getAuthState.mockResolvedValue({ status: 'signed-in', user: reviewer })
    let state = apply(initialState(shortAnswers), { kind: 'submit_application', confirm: true, shortAnswers })
    expect(state.version).toBe(3)
    async function expectLane(action: 'review' | 'applicant' | 'verification' | 'decision') {
      await db.grantApplication.update({ where: { id: oldId }, data: { state: state as Prisma.InputJsonValue } })
      expect((await read({ q: `${prefix} Synthetic Waiting`, page: 1, action })).rows)
        .toMatchObject([{ id: oldId, nextAction: action }])
    }
    await expectLane('review')
    state = apply(state, { kind: 'clear_milestone', confirm: true })
    await expectLane('applicant')
    const deliver = { kind: 'submit_delivery', release: 'https://example.test/release', reproduction: 'https://example.test/demo', note: 'Synthetic evidence' } as const
    state = apply(state, deliver)
    await expectLane('verification')
    const inspect = { kind: 'review_delivery', inspected: true, reproduced: true, matches: true,
      note: 'Synthetic inspection', evidence: 'Synthetic evidence' } as const
    state = apply(state, { ...inspect, deliveryId: state.deliveries.at(-1)!.id, outcome: 'changes_requested' })
    await expectLane('applicant')
    state = apply(state, deliver)
    state = apply(state, { ...inspect, deliveryId: state.deliveries.at(-1)!.id, outcome: 'accepted' })
    await expectLane('decision')
  })

  it('classifies legacy awards through confirmation, delivery and follow-up', async () => {
    getAuthState.mockResolvedValue({ status: 'signed-in', user: reviewer })
    const assessment = structuredClone(submitted.assessment)
    for (const id of criterionIds) assessment.criteria[id] = { score: '2', basis: 'E', source: 'Inspected artifact', rationale: 'Supported scope' }
    for (const id of clearanceIds) assessment.clearances[id] = { state: 'pass', evidence: 'Verified synthetic readiness' }
    let state = apply(submitted, { kind: 'save_assessment', assessment })
    state = apply(state, {
      kind: 'record_decision', outcome: 'approved', terms, rationale: 'Supported', publicNote: 'Agreed',
      ownerId: reviewer.id, budget: 'Private budget reference', authority: 'Synthetic committee',
    })
    // Legacy rows have no status-release array and still use the same queue.
    const { statusReleases: _statusReleases, ...legacy } = state
    await db.grantApplication.update({ where: { id: oldId }, data: { status: state.status, state: { ...legacy, version: 1 } as Prisma.InputJsonValue } })
    const query = { q: `${prefix} Synthetic Waiting`, page: 1 }
    expect((await read({ ...query, action: 'applicant' })).rows).toMatchObject([{ id: oldId, status: 'approved', nextAction: 'applicant' }])
    state = apply(state, { kind: 'confirm_terms', confirm: true })
    state = apply(state, { kind: 'submit_delivery', release: 'https://example.test/release', reproduction: 'https://example.test/demo', note: 'Synthetic evidence' })
    await db.grantApplication.update({ where: { id: oldId }, data: { state: state as Prisma.InputJsonValue } })
    expect((await read({ ...query, action: 'verification' })).rows).toMatchObject([{ id: oldId }])
    state = apply(state, {
      kind: 'review_delivery', deliveryId: state.deliveries.at(-1)!.id, outcome: 'accepted',
      inspected: true, reproduced: true, matches: true, note: 'Synthetic inspection', evidence: 'Synthetic evidence',
    })
    await db.grantApplication.update({ where: { id: oldId }, data: { state: state as Prisma.InputJsonValue } })
    const result = await read({ ...query, action: 'operations' })
    expect(result.rows).toMatchObject([{ id: oldId }])
    expect(JSON.stringify(result)).not.toContain('Private budget reference')
  })

  it('filters older roundless plans by their latest pinned milestone attempts before pagination', async () => {
    getAuthState.mockResolvedValue({ status: 'signed-in', user: reviewer })
    const planAnswers = planSubmission.parse({
      intakeVersion: 3, amountMinor: terms.amountMinor, summary: 'Ship two synthetic deliverables',
      milestones: ['Quickstart', 'Replay'].map((title) => ({ source: 'application', title, due: terms.due, evidence: terms.acceptance })),
    })
    const submittedPlan = apply(initialState(planAnswers), { kind: 'submit_application', confirm: true, planAnswers })
    if (submittedPlan.version !== 4) throw new Error('Expected a v4 milestone plan')
    const plan = submittedPlan.applications[0]
    const [first, second] = plan.answers.milestones
    const planId = plan.id
    const query = { q: `${prefix.toUpperCase()} synthetic`, page: 1 }
    const persist = (state: GrantState) => db.grantApplication.update({
      where: { id: oldId },
      data: { state: state as Prisma.InputJsonValue, status: state.status, roundId: null, updatedAt: new Date(date.getTime() - 1) },
    })
    const expectLane = async (state: GrantState, action: ReviewQueueAction) => {
      await persist(state)
      expect((await read({ q: `${query.q} Waiting`, page: 1, action })).rows)
        .toMatchObject([{ id: oldId, nextAction: action, round: null }])
    }

    // A newer roundless application remains unapproved and must never fill the verification lane.
    const otherId = `${prefix}-00`
    const otherPlan = transition(initialState(planAnswers), { kind: 'submit_application', confirm: true, planAnswers },
      { id: randomUUID(), actorId: ownerId, now: date.toISOString(), projectVersionId: otherId })
    await db.grantApplication.update({ where: { id: otherId }, data: { roundId: null, state: otherPlan as Prisma.InputJsonValue } })
    await expectLane(submittedPlan, 'review')
    const approved = apply(submittedPlan, { kind: 'clear_milestone', confirm: true, planId })

    const deliver = (milestoneId: string, previousAttemptId: string | null = null) => ({
      kind: 'submit_delivery', planId, milestoneId, previousAttemptId,
      release: 'https://example.test/release', reproduction: 'https://example.test/demo', note: 'Synthetic evidence',
    } as const)
    const inspect = (milestoneId: string, deliveryId: string, outcome: 'accepted' | 'changes_requested') => ({
      kind: 'review_delivery', planId, milestoneId, deliveryId, outcome, inspected: true, reproduced: true, matches: true,
      note: 'Private synthetic proof review', evidence: 'Synthetic inspection',
    } as const)
    const mixed = apply(approved, deliver(first.milestoneId))
    await persist(mixed)
    expect((await read(query)).rows.some(({ id }) => id === oldId)).toBe(false)
    expect((await read({ ...query, page: 2 })).rows).toContainEqual(expect.objectContaining({ id: oldId, round: null }))
    const filtered = await read({ ...query, action: 'verification' })
    expect(filtered.rows.map(({ id }) => id)).toEqual([oldId])
    expect(filtered.hasMore).toBe(false)
    expect((await read({ ...query, action: 'applicant' })).rows).toHaveLength(0)
    await expectLane(approved, 'applicant')

    const openRequest = apply(mixed, { kind: 'request_evidence', title: 'Explain the result', body: 'Private synthetic note' })
    await expectLane(openRequest, 'applicant')
    await expectLane({ ...openRequest, closedAt: date.toISOString() }, 'inactive')

    const firstAttempt = mixed.deliveries[0]
    const returned = apply(mixed, inspect(first.milestoneId, firstAttempt.id, 'changes_requested'))
    await expectLane(returned, 'applicant')
    const resubmitted = apply(returned, deliver(first.milestoneId, firstAttempt.id))
    await expectLane(resubmitted, 'verification')
    const firstAccepted = apply(resubmitted, inspect(first.milestoneId, resubmitted.deliveries.at(-1)!.id, 'accepted'))
    if (firstAccepted.version !== 4) throw new Error('Expected v4 delivery attempts')
    const foreignAttempt = { ...firstAccepted.deliveries[0], id: randomUUID(), planId: randomUUID(), state: 'submitted', review: null } as const
    await expectLane({ ...firstAccepted, deliveries: [...firstAccepted.deliveries, foreignAttempt] }, 'applicant')

    const bothDelivered = apply(firstAccepted, deliver(second.milestoneId))
    const bothAccepted = apply(bothDelivered, inspect(second.milestoneId, bothDelivered.deliveries.at(-1)!.id, 'accepted'))
    if (bothAccepted.version !== 4) throw new Error('Expected v4 delivery attempts')
    await expectLane({ ...bothAccepted, deliveries: [...bothAccepted.deliveries, foreignAttempt] }, 'decision')
    expect(JSON.stringify(await read({ ...query, action: 'decision' }))).not.toContain('Private synthetic proof review')

    const assessment = structuredClone(bothAccepted.assessment)
    for (const id of criterionIds) assessment.criteria[id] = { score: '2', basis: 'E', source: 'Synthetic evidence', rationale: 'Supported scope' }
    for (const id of clearanceIds) assessment.clearances[id] = { state: 'pass', evidence: 'Verified synthetic readiness' }
    const assessed = apply(bothAccepted, { kind: 'save_assessment', assessment })
    await expectLane(apply(assessed, {
      kind: 'record_decision', outcome: 'approved', terms: { ...terms, ...planAwardScope(plan.answers.milestones) },
      rationale: 'Supported', publicNote: 'Agreed', ownerId: reviewer.id, budget: 'Synthetic budget', authority: 'Synthetic committee',
    }), 'operations')
  })
})
