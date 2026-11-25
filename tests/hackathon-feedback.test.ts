import { test, expect } from 'vitest'
import { missingProjectRequirements, projectRequirementLabel } from '@/lib/project-requirements'
import { buildAnswersSchema } from '@/app/(site)/events/_lib/hackathons/rules'

const complete = { maturity: 'mvp', fullDescription: 'Built', techDescription: 'How', techStack: ['TypeScript'], githubRepos: ['https://example.test/repo'], demoLinks: [], websiteUrl: 'https://example.test' }

test('[US-5.1 US-5.2] C1: existing events require project stage; organizer can make it optional', () => {
  expect(missingProjectRequirements({ ...complete, maturity: null })).toEqual(['Project stage'])
  expect(missingProjectRequirements({ ...complete, maturity: null }, ['maturity', 'videoUrl'])).toEqual([])
  expect(projectRequirementLabel('maturity', ['maturity'])).toBe('Project stage (Optional)')
  expect(projectRequirementLabel('maturity', [])).toBe('Project stage')
})

test('[US-5.2] C1: optional built-in requirements never block, required ones still do', () => {
  const blank = { maturity: null, fullDescription: '', techDescription: '', techStack: [], githubRepos: [], demoLinks: [], websiteUrl: null }
  expect(missingProjectRequirements(blank)).toHaveLength(6)
  expect(missingProjectRequirements(blank, ['maturity', 'fullDescription', 'techDescription', 'techStack', 'githubRepos', 'demoLinks', 'videoUrl'])).toEqual([])
  expect(missingProjectRequirements(blank, ['unknown', 'videoUrl'])).toHaveLength(6)
})

test('[US-4.1 US-4.2 US-5.3] C1: optional registration questions accept blank; required number does not coerce blank to zero', () => {
  const field = { id: 'number', label: 'Experience', type: 'number', required: true, options: [], maxLength: null }
  expect(buildAnswersSchema([field]).safeParse({ number: '' }).success).toBe(false)
  expect(buildAnswersSchema([{ ...field, required: false }]).parse({ number: '' })).toEqual({ number: null })
  const select = { ...field, type: 'select', options: ['Prototype', 'MVP'], required: false }
  expect(buildAnswersSchema([select]).safeParse({}).success).toBe(true)
})

test('[US-6.2 US-6.3] C2: tracks and sponsor prizes are optional independent selections, foreign IDs rejected', async () => {
  const { selectionProblem, matchesSubmissionFilters } = await import('@/app/(site)/events/_lib/hackathons/feedback-rules')
  expect(selectionProblem([], ['track-a'], 'track')).toBeNull()
  expect(selectionProblem(['foreign'], ['track-a'], 'track')).toBe('Unknown track')
  const sub = { trackIds: ['track-a'], sponsorPrizeIds: ['sponsor-a'] }
  expect(matchesSubmissionFilters(sub, { track: 'track-a', sponsor: 'sponsor-a' })).toBe(true)
  expect(matchesSubmissionFilters(sub, { sponsor: 'sponsor-b' })).toBe(false)
  expect(matchesSubmissionFilters(sub, { track: 'none' })).toBe(false)
  expect(matchesSubmissionFilters({ trackIds: [], sponsorPrizeIds: [] }, { track: 'none' })).toBe(true)
})

test('[US-8.1 US-9.1] C3: team states distinguish invitation, registration and team membership', async () => {
  const { teamMemberStatus, teamWarnings, parseInviteTarget } = await import('@/lib/project-team')
  expect(teamMemberStatus(false, 'active')).toBe('Registered for this hackathon, invited to team')
  expect(teamMemberStatus(true, null)).toBe('Joined team, not registered for this hackathon')
  expect(teamMemberStatus(true, 'active')).toBe('Joined team, registered for this hackathon')
  expect(teamWarnings([{ name: 'Builder One', registered: false }], 1)).toEqual(['1 pending team invitation. Invited people are not included in the submission.', 'Not registered for this hackathon: Builder One.'])
  expect(parseInviteTarget(' Builder@EXAMPLE.test ')).toEqual({ email: 'builder@example.test' })
  expect(parseInviteTarget('@builder_1')).toEqual({ handle: 'builder_1' })
  expect(parseInviteTarget('some name')).toBeNull()
})

test('[US-7.1 US-7.2] C4: a project draft is never a submission; timestamps and withdrawal stay distinct', async () => {
  const { submissionBanner } = await import('@/lib/submission-status')
  expect(submissionBanner(null, null)).toBe('Draft, not submitted')
  expect(submissionBanner('active', new Date('2026-11-19T10:00:00Z'))).toBe('Submitted on Thu, Nov 19, 2026, 10:00 AM UTC')
  expect(submissionBanner('withdrawn', new Date())).toBe('Withdrawn, not submitted')
})

test('[US-12.2] C5: demo videos require a recognized video path, not just an allowed hostname', async () => {
  const { videoPreview } = await import('@/lib/demo-video')
  expect(videoPreview('https://www.youtube.com/watch?v=abcdefghijk')?.provider).toBe('YouTube')
  expect(videoPreview('https://youtu.be/abcdefghijk?t=10')?.id).toBe('abcdefghijk')
  expect(videoPreview('https://www.loom.com/share/0123456789abcdef0123456789abcdef')?.provider).toBe('Loom')
  expect(videoPreview('https://vimeo.com/123456789')?.provider).toBe('Vimeo')
  for (const url of ['https://youtube.com', 'https://youtube.com/@channel', 'https://youtube.com/watch?v=bad', 'https://youtube.com.evil.test/watch?v=abcdefghijk', 'https://evil.test/?youtube.com', 'javascript:alert(1)', 'https://user:password@youtube.com/watch?v=abcdefghijk']) expect(videoPreview(url)).toBeNull()
})

test('[US-2.1 US-16.1 US-16.3] C6: each prize publishes independently; unpublished winners stay pending', async () => {
  const { prizeWinnerState, needsResultsReminder } = await import('@/app/(site)/events/_lib/hackathons/feedback-rules')
  expect(prizeWinnerState(null, 1)).toBe('Winner to be announced')
  expect(prizeWinnerState(new Date(), 1)).toBe('published')
  expect(prizeWinnerState(new Date(), 0)).toBe('Winner to be announced')
  expect(needsResultsReminder([{ judgingClosedAt: new Date() }], 0)).toBe(true)
  expect(needsResultsReminder([{ judgingClosedAt: null }], 0)).toBe(false)
  expect(needsResultsReminder([{ judgingClosedAt: new Date() }], 1)).toBe(false)
})

test('[US-4.2] C1: required numbers reject null and booleans instead of coercing them', () => {
  const f = { id: 'n', label: 'Years', type: 'number', required: true, options: [], maxLength: null }
  for (const n of [null, false, true]) expect(buildAnswersSchema([f]).safeParse({ n }).success).toBe(false)
  expect(buildAnswersSchema([f]).parse({ n: '0' })).toEqual({ n: 0 })
})

test('[US-12.2] C5: video paths cannot silently ignore trailing segments', async () => {
  const { videoPreview } = await import('@/lib/demo-video')
  expect(videoPreview('https://youtube.com/embed/abcdefghijk/not-a-video')).toBeNull()
})

test('[US-13.3] C2/C6: a sponsor winner must have opted in even if its award already exists', async () => {
  const { isEligibleForPrize } = await import('@/app/(site)/events/_lib/hackathons/feedback-rules')
  const sub = { trackIds: ['t1'], sponsorPrizeIds: ['s1'] }
  expect(isEligibleForPrize(sub, { trackId: null, sponsorPrizeId: 's1' })).toBe(true)
  expect(isEligibleForPrize(sub, { trackId: null, sponsorPrizeId: 's2' })).toBe(false)
  expect(isEligibleForPrize(sub, { trackId: 't2', sponsorPrizeId: null })).toBe(false)
  expect(isEligibleForPrize(sub, { trackId: null, sponsorPrizeId: null })).toBe(true)
})

test('[US-7.4] C4: confirmation must match the revision and the joined team shown to the participant', async () => {
  const { matchesSubmissionConfirmation } = await import('@/lib/submission-status')
  const current = { id: 'v1', updatedAt: new Date('2026-11-19T10:00:00Z') }
  const confirmation = { versionId: 'v1', updatedAt: '2026-11-19T10:00:00.000Z', teamUserIds: ['b', 'a'] }
  expect(matchesSubmissionConfirmation(current, ['a', 'b'], confirmation)).toBe(true)
  expect(matchesSubmissionConfirmation({ ...current, id: 'v2' }, ['a', 'b'], confirmation)).toBe(false)
  expect(matchesSubmissionConfirmation({ ...current, updatedAt: new Date('2026-11-19T10:01:00Z') }, ['a', 'b'], confirmation)).toBe(false)
  expect(matchesSubmissionConfirmation(current, ['a', 'b', 'c'], confirmation)).toBe(false)
})

test('[US-2.2 US-2.3] C2/C6: result filters apply to the winning submission, including overall free projects', async () => {
  const { visiblePrizeAwards } = await import('@/app/(site)/events/_lib/hackathons/feedback-rules')
  const awards = [{ id: 'free', submission: { trackIds: [], sponsorPrizeIds: ['s1'] } }, { id: 'both', submission: { trackIds: ['t1'], sponsorPrizeIds: ['s1'] } }]
  expect(visiblePrizeAwards({ publishedAt: new Date(), awards }, { track: 'none' }).map((a) => a.id)).toEqual(['free'])
  expect(visiblePrizeAwards({ publishedAt: new Date(), awards }, { track: 't1', sponsor: 's1' }).map((a) => a.id)).toEqual(['both'])
  expect(visiblePrizeAwards({ publishedAt: null, awards }, {})).toEqual([])
})

test('[US-11.1 US-11.2] C3 addendum: organizer correction adds or replaces a registered member without changing the project', async () => {
  const { planTeamCorrection } = await import('@/lib/submission-team')
  const current = [{ userId: 'a', name: 'Builder One' }]
  const ctx = { teamSizeMin: 1, teamSizeMax: 3, activeParticipants: new Set(['b']), otherSubmissionUsers: new Set<string>(), reviewerUserIds: new Set<string>(), allowMultipleSubmissions: false }
  expect(planTeamCorrection(current, { add: { userId: 'b', name: 'Builder Two' }, removeUserId: null }, ctx)).toEqual({ ok: true, team: [...current, { userId: 'b', name: 'Builder Two' }] })
  expect(current).toHaveLength(1)
  expect(planTeamCorrection(current, { add: { userId: 'b', name: 'Builder Two' }, removeUserId: 'a' }, ctx)).toEqual({ ok: true, team: [{ userId: 'b', name: 'Builder Two' }] })
  expect(planTeamCorrection(current, { add: null, removeUserId: 'a' }, ctx).ok).toBe(false)
})

test('[US-11.3] C3 addendum: correction preserves registration, size, duplicate-team and judge conflict constraints', async () => {
  const { planTeamCorrection } = await import('@/lib/submission-team')
  const current = [{ userId: 'a', name: 'Builder One' }], change = { add: { userId: 'b', name: 'Builder Two' }, removeUserId: null }
  const ctx = { teamSizeMin: 1, teamSizeMax: 3, activeParticipants: new Set(['b']), otherSubmissionUsers: new Set<string>(), reviewerUserIds: new Set<string>(), allowMultipleSubmissions: false }
  for (const overrides of [{ activeParticipants: new Set<string>() }, { teamSizeMax: 1 }, { otherSubmissionUsers: new Set(['b']) }, { reviewerUserIds: new Set(['b']) }]) expect(planTeamCorrection(current, change, { ...ctx, ...overrides }).ok).toBe(false)
  expect(planTeamCorrection(current, { add: current[0]!, removeUserId: null }, { ...ctx, activeParticipants: new Set(['a']) }).ok).toBe(false)
})


test('[US-5.2] F3: demo video is optional by default and independently enforceable at submission', () => {
  expect(missingProjectRequirements({ ...complete, videoUrl: null })).toEqual([])
  expect(missingProjectRequirements({ ...complete, videoUrl: null }, [])).toEqual(['Demo video'])
  expect(missingProjectRequirements({ ...complete, videoUrl: 'https://youtu.be/abcdefghijk' }, [])).toEqual([])
  expect(missingProjectRequirements({ ...complete, videoUrl: null }, ['videoUrl'])).toEqual([])
  expect(projectRequirementLabel('videoUrl', ['videoUrl'])).toBe('Demo video (Optional)')
  expect(projectRequirementLabel('videoUrl', [])).toBe('Demo video')
})

test('[US-9.2] F4: only the selected project owner gets the direct invitation control', async () => {
  const { canInviteTeammates } = await import('@/lib/project-team')
  const members = [{ userId: 'owner', role: 'owner' }, { userId: 'writer', role: 'writer' }, { userId: 'reader', role: 'reader' }]
  expect(canInviteTeammates(members, 'owner')).toBe(true)
  for (const id of ['writer', 'reader', 'registered-outsider']) expect(canInviteTeammates(members, id)).toBe(false)
  expect(canInviteTeammates([], 'owner')).toBe(false)
})

test.each([
  [false, 'pending', 'Invited to team, registration awaiting approval'],
  [true, 'pending', 'Joined team, registration awaiting approval'],
  [false, null, 'Invited to team, not registered for this hackathon'],
  [true, 'rejected', 'Joined team, not registered for this hackathon'],
  [true, 'withdrawn', 'Joined team, not registered for this hackathon'],
])('[US-8.1] team status for joined=%s registration=%s', async (joined, registration, label) => {
  const { teamMemberStatus } = await import('@/lib/project-team')
  expect(teamMemberStatus(joined, registration)).toBe(label)
})

test('[US-8.1] a fully registered team has no warnings; plural invitations stay outside the team', async () => {
  const { teamWarnings } = await import('@/lib/project-team')
  expect(teamWarnings([{ name: 'Builder One', registered: true }], 0)).toEqual([])
  expect(teamWarnings([{ name: 'Builder One', registered: true }], 2)).toEqual(['2 pending team invitations. Invited people are not included in the submission.'])
})

test('[US-6.3] foreign sponsor selection and either mismatched filter are refused independently', async () => {
  const { selectionProblem, matchesSubmissionFilters } = await import('@/app/(site)/events/_lib/hackathons/feedback-rules')
  expect(selectionProblem(['foreign-sponsor'], ['s1'], 'sponsor prize')).toBe('Unknown sponsor prize')
  expect(selectionProblem([], [], 'sponsor prize')).toBeNull()
  const sub = { trackIds: ['t1'], sponsorPrizeIds: ['s1'] }
  expect(matchesSubmissionFilters(sub, { track: 't2', sponsor: 's1' })).toBe(false)
  expect(matchesSubmissionFilters(sub, { track: 't1', sponsor: 's2' })).toBe(false)
  expect(matchesSubmissionFilters(sub, {})).toBe(true)
})

test('[US-16.3] results reminder follows the final stage, not an earlier closed stage', async () => {
  const { needsResultsReminder } = await import('@/app/(site)/events/_lib/hackathons/feedback-rules')
  expect(needsResultsReminder([], 0)).toBe(false)
  expect(needsResultsReminder([{ judgingClosedAt: new Date() }, { judgingClosedAt: null }], 0)).toBe(false)
  expect(needsResultsReminder([{ judgingClosedAt: null }, { judgingClosedAt: new Date() }], 0)).toBe(true)
})

test('[US-11.3] correction rejects absent removals and preserves snapshots, allowing explicit unlimited/multiple settings', async () => {
  const { planTeamCorrection } = await import('@/lib/submission-team')
  const current = [{ userId: 'a', name: 'Builder One' }]
  const before = structuredClone(current)
  const ctx = { teamSizeMin: 1, teamSizeMax: null, activeParticipants: new Set(['b']), otherSubmissionUsers: new Set(['b']), reviewerUserIds: new Set<string>(), allowMultipleSubmissions: true }
  expect(planTeamCorrection(current, { add: null, removeUserId: 'missing' }, ctx)).toEqual({ ok: false, reason: 'That member is not on the submitted team' })
  const plan = planTeamCorrection(current, { add: { userId: 'b', name: 'Builder Two' }, removeUserId: null }, ctx)
  expect(plan).toEqual({ ok: true, team: [...before, { userId: 'b', name: 'Builder Two' }] })
  expect(current).toEqual(before)
  expect(planTeamCorrection(current, { add: { userId: 'b', name: 'Builder Two' }, removeUserId: null }, { ...ctx, allowMultipleSubmissions: false }).ok).toBe(false)
})
