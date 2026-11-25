import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ projects: vi.fn(), drafts: vi.fn(), draft: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ prisma: {
  project: { findMany: mocks.projects },
  hackathonProject: { findMany: mocks.drafts, findFirst: mocks.draft },
} }))

import { getSubmissionTeams, getManagedDraft, listUnsubmittedProjects } from '@/app/(site)/events/_lib/hackathons/queries'

beforeEach(() => vi.resetAllMocks())

const orderBy = [{ createdAt: 'asc' }, { id: 'asc' }]

test('[US-7.2 US-8.3] confirmation names and IDs use join order with a deterministic member tie-breaker', async () => {
  await getSubmissionTeams('hackathon', ['project'])
  expect(mocks.projects).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ members: expect.objectContaining({ orderBy }) }) }))
})

test.each(['list', 'detail'])('[US-7.2 US-8.3] organizer draft %s uses the same team order as confirmation', async (view) => {
  if (view === 'list') await listUnsubmittedProjects('hackathon')
  else await getManagedDraft('hackathon', 'project')
  expect(view === 'list' ? mocks.drafts : mocks.draft).toHaveBeenCalledWith(expect.objectContaining({
    select: expect.objectContaining({ project: expect.objectContaining({ select: expect.objectContaining({ members: expect.objectContaining({ orderBy }) }) }) }),
  }))
})
