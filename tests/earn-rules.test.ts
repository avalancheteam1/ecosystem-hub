import { describe, expect, it } from 'vitest'
import { earnCatalogFilters, escapeSearchTerm, publicationError } from '@/app/(site)/earn/_lib/rules'
import { bountyDraftSchema } from '@/app/(site)/earn/_lib/schemas'

const draft = {
  title: 'Publish a course',
  description: 'A public Avalanche course.',
  deliverables: 'One complete lesson.',
  participation: 'Follow the instructions on the public issue.',
  participationUrl: null,
  category: 'Development',
  reward: 'A mentorship session',
  deadline: '2027-01-02T18:00:00.000Z',
  hubModule: 'Education',
  githubIssueUrl: 'https://github.com/Example/Hub/issues/4?test=1',
}

describe('Earn listing rules', () => {
  it('validates public feature references and converts deadlines to UTC dates', () => {
    expect(bountyDraftSchema.parse(draft)).toMatchObject({
      githubIssueUrl: 'https://github.com/example/hub/issues/4',
      deadline: new Date(draft.deadline),
    })
    expect(bountyDraftSchema.safeParse({ ...draft, hubModule: null }).success).toBe(false)
    expect(bountyDraftSchema.safeParse({ ...draft, githubIssueUrl: 'https://github.com/example/hub/pull/4' }).success).toBe(false)
    expect(bountyDraftSchema.safeParse({ ...draft, eligibility: 'members' }).success).toBe(false)
  })

  it.each(['bad URL', 'http://example.test', 'https://user:secret@example.test', 'javascript:alert(1)'])('rejects unsafe or invalid participation URL %s', (participationUrl) => {
    expect(bountyDraftSchema.safeParse({ ...draft, participationUrl }).success).toBe(false)
  })

  it('accepts a standard listing with an optional HTTPS participation link', () => {
    expect(bountyDraftSchema.safeParse({ ...draft, hubModule: null, githubIssueUrl: null, participationUrl: 'https://example.test/work' }).success).toBe(true)
  })

  it('requires a future deadline to publish and allows unpublishing an expired listing', () => {
    const now = new Date('2027-01-02T18:00:00.000Z')
    const future = new Date('2027-01-03T18:00:00.000Z')
    expect(publicationError(null, now, true, now)).toMatch(/future deadline/)
    expect(publicationError(null, future, true, now)).toBeNull()
    expect(publicationError(now, now, false, now)).toBeNull()
    expect(publicationError(now, future, true, now)).toMatch(/already public/)
  })

  it('bounds pages, handles repeated parameters and treats wildcard input literally', () => {
    expect(earnCatalogFilters({ q: ['  event  ', 'ignored'], type: ['feature', 'standard'], status: 'anything', page: '100001' })).toEqual({
      q: 'event', type: 'feature', status: 'open', page: 10000,
    })
    expect(escapeSearchTerm('100%_')).toBe('100\\%\\_')
  })
})
