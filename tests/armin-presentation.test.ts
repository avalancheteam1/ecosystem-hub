import { expect, test } from 'vitest'
import { registrationWindowState, registrationStatusLabel, submissionStatusLabel, submissionWindowText, judgingWindowText, publicationText } from '@/app/(site)/events/_lib/hackathons/presentation'
import { canJoin, stageState } from '@/app/(site)/events/_lib/hackathons/rules'
import { submissionBanner } from '@/lib/submission-status'
import { formatEventRange } from '@/lib/dates'

const zone = 'Europe/Rome'
const opensAt = new Date('2026-03-28T10:15:00Z')
const closesAt = new Date('2026-03-30T17:45:00Z')
const stage = { opensAt, closesAt, judgingClosedAt: null }
const h = { status: 'published', registrationOpensAt: opensAt, registrationClosesAt: closesAt, maxParticipants: null, termsUrl: null }

test.each([
  [new Date(+opensAt - 1), 'upcoming'], [opensAt, 'open'],
  [new Date(+closesAt - 1), 'open'], [closesAt, 'closed'],
])('[US-1.2] D1: registration state agrees with canJoin at %s', (now, state) => {
  expect(registrationWindowState(h, now)).toBe(state)
  expect(canJoin(h, { now, participants: 0, existing: null, invited: false, acceptedTerms: true }).ok).toBe(state === 'open')
})

test('[US-1.2] D1: unset endpoints are unbounded, viewer approval is a separate state', () => {
  expect(registrationWindowState({ registrationOpensAt: null, registrationClosesAt: null }, opensAt)).toBe('open')
  expect(registrationWindowState({ registrationOpensAt: null, registrationClosesAt: closesAt }, closesAt)).toBe('closed')
  expect(registrationStatusLabel('pending')).toBe('Awaiting approval')
})

test.each(['2026-01-10T15:30:00Z', '2026-07-10T15:30:00Z'])('[US-7.2] D2/D4: exact endpoints and submission banner use event zone: %s', (iso) => {
  const date = new Date(iso)
  expect(submissionBanner('active', date, zone)).toBe(`Submitted on ${formatEventRange(date, null, zone)}`)
  expect(submissionBanner('active', date, 'UTC')).toBe(`Submitted on ${formatEventRange(date, null, 'UTC')}`)
})

test('[US-1.4] D2: a multi-day DST window retains both times and zones', () => {
  expect(submissionWindowText(stage, zone)).toBe(`Submissions open: ${formatEventRange(opensAt, null, zone)}. Submissions close: ${formatEventRange(closesAt, null, zone)}.`)
  expect(stageState(stage, new Date(+opensAt - 1))).toBe('upcoming')
  expect(stageState(stage, opensAt)).toBe('open')
  expect(stageState(stage, closesAt)).toBe('judging')
  expect(stageState({ ...stage, judgingClosedAt: closesAt }, closesAt)).toBe('closed')
})

test('[US-1.4 US-2.4] D3: judging and publication use actual timestamps without inventing a deadline', () => {
  expect(judgingWindowText(stage, zone)).toBe(`Judging opens: ${formatEventRange(closesAt, null, zone)}. Closes when the organizer ends judging.`)
  expect(judgingWindowText({ ...stage, judgingClosedAt: closesAt }, zone)).toContain(`Judging closed: ${formatEventRange(closesAt, null, zone)}`)
  expect(publicationText(null, zone)).toBe('Announcement date not scheduled')
  expect(publicationText(closesAt, zone)).toBe(`Published: ${formatEventRange(closesAt, null, zone)}`)
})

test('D4: draft, withdrawn and disqualified meanings remain intact', () => {
  expect(submissionBanner(null, null, zone)).toBe('Draft, not submitted')
  expect(submissionBanner('withdrawn', opensAt, zone)).toBe('Withdrawn, not submitted')
  expect(submissionBanner('disqualified', opensAt, zone)).toBe('Disqualified')
})

test.each([['active', 'Submitted'], ['withdrawn', 'Withdrawn'], ['disqualified', 'Disqualified'], ['internal_key', 'Unknown status']])('[US-18.4] F1: human submission status %s', (key, label) => expect(submissionStatusLabel(key)).toBe(label))
test.each([['active', 'Registered'], ['pending', 'Awaiting approval'], ['rejected', 'Rejected'], ['withdrawn', 'Withdrawn'], ['internal_key', 'Unknown status']])('[US-18.4] F2: human registration status %s', (key, label) => expect(registrationStatusLabel(key)).toBe(label))

test.each(['toString', '__proto__'])('[US-18.4] F1/F2: unexpected object keys stay human-readable: %s', (key) => {
  expect(submissionStatusLabel(key)).toBe('Unknown status')
  expect(registrationStatusLabel(key)).toBe('Unknown status')
})
