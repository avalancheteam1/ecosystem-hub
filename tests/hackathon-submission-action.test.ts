import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), security: vi.fn(), audit: vi.fn(),
  db: { hackathon: { findUnique: vi.fn() }, project: { findUnique: vi.fn() }, submission: { findUnique: vi.fn(), findFirst: vi.fn() }, participant: { findMany: vi.fn() }, $transaction: vi.fn() },
  tx: { $executeRaw: vi.fn(), $queryRaw: vi.fn(), project: { findUnique: vi.fn() }, submission: { findFirst: vi.fn(), upsert: vi.fn() }, projectVersion: { findUniqueOrThrow: vi.fn(), update: vi.fn() }, stageEntry: { upsert: vi.fn() } },
}))
vi.mock('@/lib/db', () => ({ prisma: mocks.db }))
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.user }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/monitoring', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/security-events', () => ({ securityEvent: mocks.security }))
vi.mock('@/lib/audit', () => ({ recordAudit: mocks.audit }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { submitToStage } from '@/app/(site)/events/_lib/hackathons/submission-actions'
import { PROJECT_REQUIREMENTS } from '@/lib/project-requirements'

const version = { maturity: null, fullDescription: '', techDescription: '', techStack: [], githubRepos: [], demoLinks: [], websiteUrl: null, id: 'v1', updatedAt: new Date('2026-11-19T00:00:00Z'), sealedAt: new Date('2026-11-18T00:00:00Z') }
const members = [{ userId: 'captain', role: 'owner', user: { name: 'Captain' } }, { userId: 'writer', role: 'writer', user: { name: 'Writer' } }]
const project = () => ({ id: 'project', archivedAt: null, currentVersionId: 'v1', currentVersion: { ...version }, members: structuredClone(members) })
const input = () => ({ hackathonId: 'h', stageId: 's', projectId: 'project', confirmation: { versionId: 'v1', updatedAt: version.updatedAt.toISOString(), teamUserIds: ['captain', 'writer'] }, trackIds: [], answers: {}, preexistingIdea: false })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ id: 'captain', name: 'Captain', permissions: new Set() })
  mocks.db.hackathon.findUnique.mockResolvedValue({ id: 'h', status: 'published', allowMultipleSubmissions: false, optionalProjectFields: Object.keys(PROJECT_REQUIREMENTS), teamSizeMin: 1, teamSizeMax: 5, tracks: [], sponsorPrizes: [], event: { slug: 'synthetic', name: 'Synthetic event' }, stages: [{ id: 's', opensAt: new Date(Date.now() - 60000), closesAt: new Date(Date.now() + 60000), judgingClosedAt: null, fields: [] }] })
  mocks.db.project.findUnique.mockResolvedValue(project())
  mocks.tx.project.findUnique.mockResolvedValue(project())
  mocks.db.submission.findUnique.mockResolvedValue(null)
  mocks.db.submission.findFirst.mockResolvedValue(null)
  mocks.db.participant.findMany.mockResolvedValue([{ userId: 'captain' }, { userId: 'writer' }])
  mocks.tx.submission.findFirst.mockResolvedValue(null)
  mocks.tx.projectVersion.findUniqueOrThrow.mockResolvedValue(version)
  mocks.tx.submission.upsert.mockResolvedValue({ id: 'sub' })
  mocks.tx.stageEntry.upsert.mockResolvedValue({ id: 'entry' })
  mocks.db.$transaction.mockImplementation((run) => run(mocks.tx))
})

test.each(['joined', 'left', 'version'])('[US-7.4 US-8.3] rejects %s changes that commit while submission waits for its lock', async (change) => {
  const fresh = project()
  if (change === 'joined') fresh.members.push({ userId: 'new-writer', role: 'writer', user: { name: 'New writer' } })
  if (change === 'left') fresh.members.pop()
  if (change === 'version') { fresh.currentVersionId = 'v2'; fresh.currentVersion.id = 'v2' }
  mocks.tx.project.findUnique.mockResolvedValue(fresh)
  expect(await submitToStage(input())).toMatchObject({ ok: false, error: expect.stringMatching(/changed|confirm/i) })
  expect(mocks.tx.stageEntry.upsert).not.toHaveBeenCalled()
  expect(mocks.tx.projectVersion.update).not.toHaveBeenCalled()
  expect(mocks.audit).not.toHaveBeenCalled()
})

test('[US-7.4 US-8.3] revoking writer authority while waiting denies submission', async () => {
  const fresh = project()
  fresh.members[0]!.role = 'reader'
  mocks.tx.project.findUnique.mockResolvedValue(fresh)
  expect(await submitToStage(input())).toMatchObject({ ok: false })
  expect(mocks.tx.stageEntry.upsert).not.toHaveBeenCalled()
  expect(mocks.security).toHaveBeenCalledWith('action.forbidden', expect.anything())
})

test.each([false, true])('[US-7.2 US-7.4] unchanged confirmation succeeds, reordered team = %s', async (reorder) => {
  const fresh = project()
  if (reorder) fresh.members.reverse()
  mocks.tx.project.findUnique.mockResolvedValue(fresh)
  expect(await submitToStage(input())).toMatchObject({ ok: true })
  expect(mocks.tx.stageEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ projectVersionId: 'v1', teamSnapshot: members.map((m) => ({ userId: m.userId, name: m.user.name })) }) }))
  expect(mocks.audit).toHaveBeenCalledOnce()
})

test('[US-3.1] unauthenticated submission never queries project data', async () => {
  mocks.user.mockResolvedValue(null)
  expect(await submitToStage(input())).toEqual({ ok: false, error: 'Not signed in' })
  expect(mocks.db.project.findUnique).not.toHaveBeenCalled()
})

test('[US-7.2 US-8.3] saved team snapshot queries members in the same stable order as confirmation', async () => {
  expect(await submitToStage(input())).toMatchObject({ ok: true })
  expect(mocks.db.project.findUnique).toHaveBeenCalledWith(expect.objectContaining({
    include: expect.objectContaining({ members: expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) }),
  }))
})
