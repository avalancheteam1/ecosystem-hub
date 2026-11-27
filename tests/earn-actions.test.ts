import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as unknown,
  transaction: vi.fn(),
  updateMany: vi.fn(),
  auditLogCreate: vi.fn(),
  findUnique: vi.fn(),
  findSubmission: vi.fn(),
  createBounty: vi.fn(),
  createStages: vi.fn(),
  deleteStages: vi.fn(),
  updateStage: vi.fn(),
  updateStages: vi.fn(),
  findOrganization: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => state.user }))
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))
vi.mock('@/lib/monitoring', () => ({ captureError: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: state.revalidatePath }))
vi.mock('@/lib/db', () => ({ prisma: { $transaction: state.transaction } }))

import { createBountyDraft, saveBountyDraft, setBountyPublication } from '@/app/(site)/earn/_lib/actions'
import { IMAGE_KINDS } from '@/lib/image-kinds'

const publisher = { id: 'test-user', isSuperAdmin: false, permissions: new Set(['earn.publish']) }
const id = '83a2f90c-8226-400c-8df0-19fe4827db49'
const draft = {
  title: 'Public listing', description: 'Description', deliverables: 'Deliverables', participation: 'Instructions',
  participationUrl: null, category: 'Development' as const, reward: 'Mentorship', deadline: '2027-01-03T18:00:00.000Z',
  hubModule: null, githubIssueUrl: null,
}
const publish = { id, revision: 1, publish: true }
const terms = 'Synthetic existing additional terms'
const tx = {
  $queryRaw: vi.fn(async () => []),
  earnBounty: { findUnique: state.findUnique, createMany: state.createBounty, updateMany: state.updateMany },
  earnStage: { createMany: state.createStages, deleteMany: state.deleteStages, update: state.updateStage, updateMany: state.updateStages },
  earnSubmission: { findFirst: state.findSubmission },
  organization: { findUnique: state.findOrganization, findFirst: state.findOrganization },
  auditLog: { create: state.auditLogCreate },
}

describe('native Earn publishing boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.user = null
    state.transaction.mockImplementation(async (write) => write(tx))
  })

  it('rejects anonymous and ungranted callers before all three action handlers', async () => {
    expect(await createBountyDraft({ id, draft })).toEqual({ ok: false, error: 'Not signed in' })
    state.user = { ...publisher, permissions: new Set(['users.view']) }
    expect(await createBountyDraft({ id, draft })).toEqual({ ok: false, error: 'Forbidden' })
    expect(await saveBountyDraft({ id, revision: 1, draft })).toEqual({ ok: false, error: 'Forbidden' })
    expect(await setBountyPublication(publish)).toEqual({ ok: false, error: 'Forbidden' })
    expect(state.transaction).not.toHaveBeenCalled()
  })

  it('requires the expected revision and audits a successful publication in the write transaction', async () => {
    state.user = publisher
    state.findUnique.mockResolvedValue({ publishedAt: null, deadline: new Date(Date.now() + 60_000), terms, stages: [], _count: { stages: 0 } })
    state.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    expect(await setBountyPublication(publish)).toMatchObject({ ok: false })
    expect(state.auditLogCreate).not.toHaveBeenCalled()
    expect(state.revalidatePath).not.toHaveBeenCalled()
    expect(await setBountyPublication(publish)).toEqual({ ok: true, data: { id } })
    expect(state.updateMany).toHaveBeenLastCalledWith({
      where: { id, revision: 1, deadline: { gt: expect.any(Date) } },
      data: { publishedAt: expect.any(Date), revision: { increment: 1 } },
    })
    expect(state.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: publisher.id, action: 'earn.listing.publish', entityId: id }),
    })
  })

  it('#33 keeps a bounty with submission activity published and allows unpublishing without activity', async () => {
    state.user = publisher
    state.findUnique.mockResolvedValue({ publishedAt: new Date(0), deadline: new Date(Date.now() + 60_000), resultsAnnouncedAt: null })
    state.findSubmission.mockResolvedValueOnce({ id: '17f149fa-6932-4c27-85f5-096379ba4db6' }).mockResolvedValueOnce(null)
    state.updateMany.mockResolvedValue({ count: 1 })
    const unpublish = { ...publish, publish: false }

    expect(await setBountyPublication(unpublish)).toEqual({ ok: false, error: 'This bounty has recorded activity and must stay published.' })
    expect(state.findSubmission).toHaveBeenCalledExactlyOnceWith({ where: { stage: { bountyId: id } }, select: { id: true } })
    expect(state.updateMany).not.toHaveBeenCalled()
    expect(state.auditLogCreate).not.toHaveBeenCalled()
    expect(state.revalidatePath).not.toHaveBeenCalled()

    expect(await setBountyPublication(unpublish)).toEqual({ ok: true, data: { id } })
    expect(state.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id, revision: unpublish.revision },
      data: { publishedAt: null, revision: { increment: 1 } },
    })
    expect(state.auditLogCreate).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({ actorId: publisher.id, action: 'earn.listing.unpublish', entityId: id }),
    })
  })

  describe('released brief and stage contracts', () => {
    const stageId = '4f1a1aff-0e83-47df-b238-58c04948beac'
    const finalId = '90d57794-d470-4a59-9536-20bcb3a269e7'
    const stages = [
      { id: stageId, title: 'Idea', deliverables: 'Synthetic idea', requiresPrevApproval: false, requiresPullRequest: false, submissionPolicy: 'multiple' as const, approvalLimit: null },
      { id: finalId, title: 'Final', deliverables: 'Synthetic final', requiresPrevApproval: true, requiresPullRequest: false, submissionPolicy: 'multiple' as const, approvalLimit: 2 },
    ]
    const listing = {
      ...draft, id, stages: stages.map((stage, index) => ({ ...stage, bountyId: id, position: index + 1 })),
      _count: { stages: stages.length },
      publishedAt: new Date(0), deadline: new Date(Date.now() + 60_000),
      revision: 1, cancelledAt: null, resultsAnnouncedAt: null, terms, termsVersion: 1,
    }
    const change = { ...draft, deadline: listing.deadline.toISOString(), description: 'Updated synthetic brief', terms: 'Synthetic terms' }
    const editedStages = stages.map((stage) => ({ ...stage, title: `Revised ${stage.title}` }))
    const positionalStages = editedStages.map(({ id: _id, ...stage }) => stage)
    const activity = { id: '17f149fa-6932-4c27-85f5-096379ba4db6' }

    function expectNoWrite() {
      expect(state.updateMany).not.toHaveBeenCalled()
      expect(state.updateStage).not.toHaveBeenCalled()
      expect(state.updateStages).not.toHaveBeenCalled()
      expect(state.deleteStages).not.toHaveBeenCalled()
      expect(state.createStages).not.toHaveBeenCalled()
      expect(state.auditLogCreate).not.toHaveBeenCalled()
      expect(state.revalidatePath).not.toHaveBeenCalled()
    }

    beforeEach(() => {
      tx.$queryRaw.mockClear()
      state.user = publisher
      state.createBounty.mockResolvedValue({ count: 1 })
      state.updateMany.mockResolvedValue({ count: 1 })
      state.updateStages.mockResolvedValue({ count: 1 })
      state.findSubmission.mockResolvedValue(activity)
    })

    it('US-08 saves a valid brief edit on a live bounty without replacing stage records', async () => {
      state.findUnique.mockImplementation(async ({ where }) => where.publishedAt === null ? null : listing)

      expect(await saveBountyDraft({ id, revision: 1, draft: change })).toEqual({ ok: true, data: { id } })
      expect(state.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ description: change.description, revision: { increment: 1 } }),
      }))
      expect(state.deleteStages).not.toHaveBeenCalled()
      expect(state.createStages).not.toHaveBeenCalled()
      expect(state.auditLogCreate).toHaveBeenCalledOnce()
    })

    it('US-08 accepts live in-place edits using saved stage IDs', async () => {
      state.findUnique.mockImplementation(async ({ where }) => where.publishedAt === null ? null : listing)
      const live = { ...change, stages: editedStages }
      const result = await saveBountyDraft({ id, revision: 1, draft: live })
      expect(tx.$queryRaw, JSON.stringify(result)).toHaveBeenCalledOnce()
      expect(result).toEqual({ ok: true, data: { id } })
      for (const stage of editedStages) {
        expect(state.updateStage).toHaveBeenCalledWith({
          where: { id: stage.id, bountyId: id }, data: expect.objectContaining({ title: stage.title }),
        })
      }
      expect(state.deleteStages).not.toHaveBeenCalled()
      expect(state.createStages).not.toHaveBeenCalled()
      expect(state.auditLogCreate).toHaveBeenCalledOnce()
    })

    it.each([
      { label: 'reorder', stages: [...editedStages].reverse() },
      { label: 'remove', stages: editedStages.slice(1) },
      { label: 'wrong ID', stages: [{ ...editedStages[0], id: '169afc2b-3647-4743-a4a2-a62fedaf6309' }, editedStages[1]] },
      { label: 'absent saved ID', stages: [positionalStages[0], editedStages[1]] },
    ])('US-08 rejects a structural save with activity ($label) under lock', async ({ stages }) => {
      state.findUnique.mockImplementation(async ({ where }) => where.publishedAt === null ? null : listing)
      const changeTopology = { ...change, stages }
      const result = await saveBountyDraft({ id, revision: 1, draft: changeTopology })
      expect(tx.$queryRaw, JSON.stringify(result)).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/stage|order/i) })
      expect(state.findSubmission).toHaveBeenCalled()
      expectNoWrite()
    })

    it('US-08 rejects a malformed saved stage identity before mutation', async () => {
      state.findUnique.mockResolvedValue(listing)
      const malformed = { ...change, stages: [{ ...editedStages[0], id: 'not-a-uuid' }, editedStages[1]] }

      expect(await saveBountyDraft({ id, revision: 1, draft: malformed })).toMatchObject({
        ok: false, error: expect.stringMatching(/uuid|invalid/i),
      })
      expect(state.transaction).not.toHaveBeenCalled()
      expectNoWrite()
    })

    describe('published stage changes before activity', () => {
      const newFinal = { ...positionalStages[1], title: 'Intentional replacement final stage' }
      const edited = { ...change, stages: [editedStages[0], newFinal] }
      const save = { id, revision: 1, draft: edited }

      beforeEach(() => {
        state.findUnique.mockImplementation(async ({ where }) => where.publishedAt === null ? null : listing)
        state.findSubmission.mockResolvedValue(null)
      })

      it.each([
        { label: 'omitted acknowledgement', removed: undefined, includeStages: true, requiresLock: true },
        { label: 'empty acknowledgement', removed: [], includeStages: true, requiresLock: true },
        { label: 'mismatched retained ID', removed: [stageId], includeStages: true, requiresLock: true },
        { label: 'duplicate removal ID', removed: [finalId, finalId], includeStages: true, requiresLock: false },
        { label: 'unowned removal ID', removed: ['169afc2b-3647-4743-a4a2-a62fedaf6309'], includeStages: true, requiresLock: true },
        { label: 'removal without a stage list', removed: [finalId], includeStages: false, requiresLock: false },
      ])('US-08 denies implicit stage replacement ($label) without writes', async ({ removed, includeStages, requiresLock }) => {
        const input = removed === undefined ? save : { ...save, draft: includeStages ? edited : change, removedStageIds: removed }
        const result = await saveBountyDraft(input)

        expect.soft(result).toMatchObject({ ok: false, error: expect.stringMatching(/stage|remov/i) })
        expectNoWrite()
        expect(result).not.toMatchObject({ error: expect.stringMatching(/unrecognized key/i) })
        if (requiresLock) expect(tx.$queryRaw, JSON.stringify(result)).toHaveBeenCalledOnce()
      })

      it('US-08 applies a matching removal acknowledgement and retains the existing stage ID', async () => {
        const input = { ...save, removedStageIds: [finalId] }
        const result = await saveBountyDraft(input)
        expect(tx.$queryRaw, JSON.stringify(result)).toHaveBeenCalledOnce()
        expect(result).toEqual({ ok: true, data: { id } })
        expect(state.updateStage).toHaveBeenCalledWith({
          where: { id: stageId, bountyId: id }, data: expect.objectContaining({ title: editedStages[0].title, position: 1 }),
        })
        expect(state.deleteStages).toHaveBeenCalledExactlyOnceWith({ where: { bountyId: id, id: { in: [finalId] } } })
        expect(state.createStages).toHaveBeenCalledExactlyOnceWith({
          data: [expect.objectContaining({ bountyId: id, title: newFinal.title, position: 2 })],
        })
        expect(state.createStages.mock.calls[0][0].data[0].id).toBeUndefined()
        expect(state.auditLogCreate).toHaveBeenCalledOnce()
      })
    })

    it('US-08 keeps unpublished legacy positional edits on the same existing stage IDs', async () => {
      state.findUnique.mockResolvedValue({ ...listing, publishedAt: null })
      state.findSubmission.mockResolvedValue(null)

      expect(await saveBountyDraft({ id, revision: 1, draft: { ...change, stages: positionalStages } })).toEqual({ ok: true, data: { id } })
      for (const [index, stage] of editedStages.entries()) {
        expect(state.updateStage).toHaveBeenCalledWith({
          where: { id: stage.id, bountyId: id },
          data: expect.objectContaining({ title: stage.title, position: index + 1 }),
        })
      }
      expect(state.deleteStages).not.toHaveBeenCalled()
      expect(state.createStages).not.toHaveBeenCalled()
      expect(state.auditLogCreate).toHaveBeenCalledOnce()
    })

    it.each([
      { label: 'announced', announced: new Date(0), revision: 1 },
      { label: 'stale', announced: null, revision: 2 },
    ])('US-08 rejects a disallowed save ($label) without mutation', async ({ announced, revision }) => {
      state.findUnique.mockImplementation(async ({ where }) =>
        where.publishedAt === null || (where.revision !== undefined && where.revision !== revision)
          ? null : { ...listing, resultsAnnouncedAt: announced, revision },
      )
      expect(await saveBountyDraft({ id, revision: 1, draft: change })).toMatchObject({ ok: false })
      expectNoWrite()
    })

    it('US-09 denies publishing a staged native listing without effective terms', async () => {
      state.findUnique.mockResolvedValue({ ...listing, publishedAt: null, terms: null })

      const result = await setBountyPublication(publish)
      expect(tx.$queryRaw).toHaveBeenCalledOnce()
      expect.soft(result).toMatchObject({ ok: false, error: expect.stringMatching(/terms/i) })
      expectNoWrite()
    })

    it.each([
      { kind: 'native with effective terms', effectiveTerms: terms, count: stages.length },
      { kind: 'external-only without terms', effectiveTerms: null, count: 0 },
    ])('US-09 allows publication for $kind', async ({ effectiveTerms, count }) => {
      state.findUnique.mockResolvedValue({
        ...listing, publishedAt: null, terms: effectiveTerms, stages: listing.stages.slice(0, count), _count: { stages: count },
      })
      expect(await setBountyPublication(publish)).toEqual({ ok: true, data: { id } })
      expect(state.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ publishedAt: expect.any(Date), revision: { increment: 1 } }),
      }))
      expect(state.auditLogCreate).toHaveBeenCalledOnce()
    })

    it('US-09 allows an unpublished native draft with optional additional terms', async () => {
      const native = { ...change, terms: null, stages: positionalStages }
      expect(await createBountyDraft({ id, draft: native })).toEqual({ ok: true, data: { id } })
      expect(state.createBounty).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ id, terms: null }),
      }))
      expect(state.createStages).toHaveBeenCalledOnce()
      expect(state.auditLogCreate).toHaveBeenCalledOnce()
    })

    it('US-09 denies clearing the only effective terms on a live native listing', async () => {
      state.findUnique.mockImplementation(async ({ where }) => where.publishedAt === null ? null : listing)
      const result = await saveBountyDraft({ id, revision: 1, draft: { ...change, terms: null } })

      expect(tx.$queryRaw).toHaveBeenCalledOnce()
      expect.soft(result).toMatchObject({ ok: false, error: expect.stringMatching(/terms/i) })
      expectNoWrite()
    })

    it('US-09 allows a live native brief save that preserves its effective terms', async () => {
      state.findUnique.mockImplementation(async ({ where }) => where.publishedAt === null ? null : listing)

      expect(await saveBountyDraft({ id, revision: 1, draft: { ...change, terms } })).toEqual({ ok: true, data: { id } })
      expect(state.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ terms, revision: { increment: 1 } }),
      }))
      expect(state.updateMany.mock.calls[0][0].data.termsVersion).toBeUndefined()
      expect(state.createStages).not.toHaveBeenCalled()
      expect(state.deleteStages).not.toHaveBeenCalled()
      expect(state.auditLogCreate).toHaveBeenCalledOnce()
    })

    it.each([
      { prior: null, next: 'Synthetic terms', normalized: 'Synthetic terms', bump: true },
      { prior: 'Old synthetic terms', next: 'New synthetic terms', normalized: 'New synthetic terms', bump: true },
      { prior: 'Old synthetic terms', next: null, normalized: null, bump: true },
      { prior: 'Synthetic terms', next: '  Synthetic terms  ', normalized: 'Synthetic terms', bump: false },
    ])('US-09 compares normalized terms before choosing a version bump ($prior to $next)', async ({ prior, next, normalized, bump }) => {
      state.findUnique.mockResolvedValue({ ...listing, terms: prior, publishedAt: null, stages: [] })
      state.findSubmission.mockResolvedValue(null)
      expect(await saveBountyDraft({ id, revision: 1, draft: { ...draft, terms: next } })).toEqual({ ok: true, data: { id } })
      expect(state.updateMany).toHaveBeenCalledOnce()
      const { data } = state.updateMany.mock.calls[0][0]
      expect(data.terms).toBe(normalized)
      if (bump) expect(data.termsVersion).toEqual({ increment: 1 })
      else expect(data.termsVersion).toBeUndefined()
    })

    it('US-10 accepts explicit eligible shared organization attribution', async () => {
      const org = { id: 'synthetic-earn-partner', name: 'Synthetic Partner', type: 'partner', hidden: false }
      state.findOrganization.mockResolvedValue(org)
      const attributed = { ...draft, organizationId: org.id }
      const result = await createBountyDraft({ id, draft: attributed })
      expect(result).toEqual({ ok: true, data: { id } })
      expect(state.createBounty).toHaveBeenCalledWith({
        data: expect.objectContaining({ id, organizationId: org.id }), skipDuplicates: true,
      })
    })

    it.each([
      { label: 'missing row', org: null },
      { label: 'Campus-only type', org: { id: 'synthetic-issuer', name: 'Synthetic University', type: 'university', hidden: false } },
    ])('US-10 rejects an invalid issuer ($label) before creating a listing', async ({ org }) => {
      state.findOrganization.mockResolvedValue(org)
      const attributed = { ...draft, organizationId: 'synthetic-issuer' }
      const result = await createBountyDraft({ id, draft: attributed })

      expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/organization|issuer/i) })
      expect(state.findOrganization).toHaveBeenCalled()
      expect(state.createBounty).not.toHaveBeenCalled()
      expect(state.auditLogCreate).not.toHaveBeenCalled()
    })

    it.each([
      { label: 'optional null', owner: id, category: 'earn', empty: true, valid: true },
      { label: 'owned upload', owner: id, category: 'earn', empty: false, valid: true },
      { label: 'foreign upload', owner: '17f149fa-6932-4c27-85f5-096379ba4db6', category: 'earn', empty: false, valid: false },
      { label: 'wrong category', owner: id, category: 'sponsor', empty: false, valid: false },
    ])('US-11 saves only an optional own Earn logo ($label)', async ({ owner, category, empty, valid }) => {
      const earnCategory = Object.entries(IMAGE_KINDS).find(([key]) => key === 'earn-logo')?.[1].category ?? 'earn-logos'
      const folder = category === 'earn' ? earnCategory : IMAGE_KINDS['sponsor-logo'].category
      vi.stubEnv('STORAGE_PROVIDER', 'local')
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://uploads.example.test')
      const logoUrl = empty ? null : `https://uploads.example.test/uploads/${folder}/${owner}/169afc2b-3647-4743-a4a2-a62fedaf6309.png`
      try {
        const branded = { ...draft, logoUrl }
        const result = await createBountyDraft({ id, draft: branded })
        if (valid) {
          expect(result).toEqual({ ok: true, data: { id } })
          expect(state.createBounty).toHaveBeenCalledWith({ data: expect.objectContaining({ id, logoUrl }), skipDuplicates: true })
        } else {
          expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/logo|upload/i) })
          expect(result).not.toMatchObject({ error: expect.stringMatching(/unrecognized key/i) })
          expect(state.createBounty).not.toHaveBeenCalled()
          expect(state.auditLogCreate).not.toHaveBeenCalled()
        }
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })
})
