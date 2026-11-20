import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ user: vi.fn(), managed: vi.fn(), subs: vi.fn(), judging: vi.fn(), teamUsers: vi.fn() }))
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.user }))
vi.mock('@/app/(site)/events/_lib/hackathons/queries', () => ({ getManagedHackathon: mocks.managed, listSubmissions: mocks.subs, getStageJudging: mocks.judging, listSubmissionTeamUsers: mocks.teamUsers }))
import { GET } from '@/app/(app)/manage/hackathons/[id]/export.csv/route'
const request = () => GET(new Request('http://localhost/export.csv'), { params: Promise.resolve({ id: 'h' }) })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ id: 'organizer' })
  mocks.managed.mockResolvedValue({ id: 'h', tracks: [], sponsorPrizes: [], stages: [], prizes: [], event: { slug: 'synthetic' } })
  mocks.subs.mockResolvedValue([{ id: 'sub', status: 'active', trackIds: [], sponsorPrizeIds: [], project: { currentVersion: { name: 'Private unsubmitted rename' }, members: [{ user: { name: 'Removed builder', email: 'removed@example.test' } }, { user: { name: 'Private reader', email: 'reader@example.test' } }] }, entries: [{ teamSnapshot: [{ userId: 'corrected', name: 'Corrected builder' }], projectVersion: { name: 'Pinned submitted name' } }] }])
  mocks.teamUsers.mockResolvedValue([{ id: 'corrected', email: 'corrected@example.test' }])
})
test('[US-11.1 US-11.2 US-12.1 US-17.2] CSV uses corrected submitted names and pinned identity, excluding live readers and removed members', async () => {
  const response = await request()
  const text = await response.text()
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(text).toContain('Pinned submitted name')
  expect(text).toContain('Corrected builder')
  expect(text).toContain('corrected@example.test')
  expect(text).not.toMatch(/Private unsubmitted rename|Removed builder|Private reader|removed@example.test|reader@example.test/)
  expect(mocks.teamUsers).toHaveBeenCalledWith(['corrected'])
})
test('[US-3.2] CSV rejects missing authentication before reading protected data', async () => {
  mocks.user.mockResolvedValue(null)
  expect((await request()).status).toBe(401)
  expect(mocks.managed).not.toHaveBeenCalled()
  expect(mocks.subs).not.toHaveBeenCalled()
  expect(mocks.teamUsers).not.toHaveBeenCalled()
})
test('[US-3.3] CSV rejects non-organizers before reading submissions or team emails', async () => {
  mocks.managed.mockResolvedValue(null)
  expect((await request()).status).toBe(404)
  expect(mocks.subs).not.toHaveBeenCalled()
  expect(mocks.teamUsers).not.toHaveBeenCalled()
})
