import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), manage: vi.fn(), audit: vi.fn(), mail: vi.fn(),
  db: { hackathonStage: { findUnique: vi.fn() }, judgeAssignment: { findMany: vi.fn() }, $transaction: vi.fn() },
  tx: { judgeAssignment: { deleteMany: vi.fn(), createMany: vi.fn() } },
}))
vi.mock('@/lib/db', () => ({ prisma: mocks.db }))
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.user }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/monitoring', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))
vi.mock('@/lib/audit', () => ({ recordAudit: mocks.audit }))
vi.mock('@/lib/mailer', () => ({ sendMail: mocks.mail }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/app/(site)/events/_lib/hackathons/manage', () => ({ assertManage: mocks.manage, refreshResultsPublication: vi.fn() }))

import { applyAssignment, previewAssignment } from '@/app/(site)/events/_lib/hackathons/judging-actions'
import { weightedTotal } from '@/app/(site)/events/_lib/hackathons/judging'

const now = new Date('2026-11-20T12:00:00Z')
const input = { hackathonId: 'h', stageId: 's', seed: 'rebase' }
const stage = () => ({
  id: 's', hackathonId: 'h', name: 'Final', opensAt: new Date('2026-11-19T12:00:00Z'), closesAt: now, judgingClosedAt: null as Date | null,
  reviewMode: 'random', judgesPerSubmission: 1, sameTrackOnly: true, scaleMin: 1, scaleMax: 5,
  entries: [{ id: 'e', teamSnapshot: [{ userId: 'builder' }], submission: { trackIds: [], sponsorPrizeIds: ['sponsor'], project: { members: [{ userId: 'builder' }] } } }],
  hackathon: { judges: [{ id: 'j', userId: 'judge', email: 'judge@example.test', trackIds: [] }], stages: [{ id: 's', order: 0 }] },
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  mocks.user.mockResolvedValue({ id: 'organizer', permissions: new Set() })
  mocks.manage.mockResolvedValue({ event: { name: 'Synthetic event' } })
  mocks.db.hackathonStage.findUnique.mockResolvedValue(stage())
  mocks.db.judgeAssignment.findMany.mockResolvedValue([])
  mocks.db.$transaction.mockImplementation((run) => run(mocks.tx))
  mocks.mail.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

for (const [name, draw] of [['preview', previewAssignment], ['apply', applyAssignment]] as const) {
  test.each(['upcoming', 'open', 'closed'])('[US-14.3] ' + name + ' refuses a %s stage without assignments, mail or audit', async (state) => {
    const s = stage()
    if (state === 'upcoming') s.opensAt = new Date(now.getTime() + 60000)
    if (state !== 'closed') s.closesAt = new Date(now.getTime() + 120000)
    else s.judgingClosedAt = now
    mocks.db.hackathonStage.findUnique.mockResolvedValue(s)
    expect(await draw(input)).toEqual({ ok: false, error: state === 'closed' ? 'Judging is closed for this stage' : 'Draw judges once submissions close' })
    expect(mocks.db.judgeAssignment.findMany).not.toHaveBeenCalled()
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
    expect(mocks.mail).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  test('[US-14.3 US-15.3] ' + name + ' works exactly at close for a 1-to-5 stage with no track and a sponsor choice', async () => {
    expect(await draw(input)).toMatchObject({ ok: true, data: name === 'preview' ? { total: 1 } : { assigned: 1, added: 1 } })
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(name === 'apply' ? 1 : 0)
    expect(mocks.mail).toHaveBeenCalledTimes(name === 'apply' ? 1 : 0)
    expect(mocks.audit).toHaveBeenCalledTimes(name === 'apply' ? 1 : 0)
  })
}

test('[US-14.2 US-15.3] redrawing at close preserves reviewed pairs and normalized 1-to-5 totals', async () => {
  const scores = { tech: 3 }
  mocks.db.judgeAssignment.findMany.mockResolvedValue([{ judgeId: 'j', entryId: 'e', review: { submittedAt: now, conflictDeclared: false, scores } }])
  expect(await applyAssignment(input)).toEqual({ ok: true, data: { assigned: 1, added: 0 } })
  expect(mocks.tx.judgeAssignment.deleteMany).toHaveBeenCalledWith({ where: { entry: { stageId: 's' }, OR: [{ review: null }, { review: { submittedAt: null } }] } })
  expect(mocks.tx.judgeAssignment.createMany).toHaveBeenCalledWith({ data: [], skipDuplicates: true })
  expect(mocks.mail).not.toHaveBeenCalled()
  expect(weightedTotal(scores, [{ id: 'tech', weight: 1 }], 5, 1)).toBe(50)
})

test('[US-3.1] unsigned draw requests never load stage data', async () => {
  mocks.user.mockResolvedValue(null)
  expect(await previewAssignment(input)).toEqual({ ok: false, error: 'Not signed in' })
  expect(await applyAssignment(input)).toEqual({ ok: false, error: 'Not signed in' })
  expect(mocks.db.hackathonStage.findUnique).not.toHaveBeenCalled()
})
