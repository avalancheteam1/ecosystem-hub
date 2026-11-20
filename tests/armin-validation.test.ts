import { expect, test } from 'vitest'
import { stageSchema, sponsorPrizeSchema, fieldSchema, teamCorrectionSchema, submissionDetailsSchema } from '@/app/(site)/events/_lib/hackathons/schemas'
import { projectLinkError } from '@/app/(app)/projects/_lib/schemas'
import { inviteTargetError, parseInviteTarget } from '@/lib/project-team'
import { collectFieldErrors } from '@/lib/form-errors'

const stage = { hackathonId: 'h', name: 'Round', descriptionMd: '', opensAt: '2026-11-19T10:00:00Z', closesAt: '2026-11-20T17:45:00Z', reviewMode: 'all', judgesPerSubmission: '', scaleMin: '1', scaleMax: '5', showCriteria: true, advancedOnly: false, sameTrackOnly: true }
test('[US-15.2] G2: valid stage parses once for client and action', () => expect(stageSchema.safeParse(stage).success).toBe(true))
test.each([
  [{ name: ' ' }, 'name'], [{ closesAt: stage.opensAt }, 'closesAt'],
  [{ closesAt: '2026-11-18T10:00:00Z' }, 'closesAt'], [{ scaleMax: '1' }, 'scaleMax'],
  [{ scaleMin: '2' }, 'scaleMin'], [{ scaleMax: '' }, 'scaleMax'],
  [{ reviewMode: 'random', judgesPerSubmission: '' }, 'judgesPerSubmission'],
  [{ reviewMode: 'random', judgesPerSubmission: 'bad' }, 'judgesPerSubmission'],
])('[US-15.2] G2: stage errors identify the field: %j', (change, field) => {
  const parsed = stageSchema.safeParse({ ...stage, ...change })
  expect(parsed.success).toBe(false)
  if (!parsed.success) {
    expect(parsed.error.issues.some((i) => i.path[0] === field)).toBe(true)
    expect(parsed.error.issues.every((i) => !/Invalid input|expected/.test(i.message))).toBe(true)
  }
})
test('[US-11.4 US-13.2] G2: whitespace sponsor, prize and correction reason have human messages', () => {
  const parsed = sponsorPrizeSchema.safeParse({ hackathonId: 'h', sponsor: ' ', name: ' ', description: '', eligibilityHint: '' })
  expect(parsed.success).toBe(false)
  if (!parsed.success) expect(parsed.error.issues.map((i) => i.message)).toEqual(['Name the sponsor', 'Name the prize'])
  const corrected = teamCorrectionSchema.safeParse({ hackathonId: 'h', entryId: 'e', addTarget: 'bad', removeUserId: '', reason: ' ' })
  expect(corrected.success).toBe(false)
  if (!corrected.success) expect(corrected.error.issues.map((i) => i.path[0])).toEqual(['addTarget', 'reason'])
})
test('[US-5.4 US-11.4] G2: no correction and one-choice questions point to usable controls', () => {
  const corrected = teamCorrectionSchema.safeParse({ hackathonId: 'h', entryId: 'e', addTarget: '', removeUserId: '', reason: 'Correction' })
  expect(corrected.success).toBe(false)
  if (!corrected.success) expect(corrected.error.issues[0]?.path).toEqual(['addTarget'])
  const field = fieldSchema.safeParse({ hackathonId: 'h', label: 'Choice', type: 'select', required: false, options: ['One', 'One'], maxLength: '' })
  expect(field.success).toBe(false)
  if (!field.success) expect(field.error.issues[0]?.path).toEqual(['options'])
})

const fields = [
  { id: 'consent', label: 'Agreement', type: 'checkbox', required: true, options: [], maxLength: null },
  { id: 'choices', label: 'Technologies', type: 'multi_select', required: true, options: ['A'], maxLength: null },
  { id: 'number', label: 'Team count', type: 'number', required: true, options: [], maxLength: null },
  { id: 'url', label: 'Pitch', type: 'url', required: true, options: [], maxLength: null },
  { id: 'text', label: 'Work done', type: 'short_text', required: true, options: [], maxLength: null },
]
test('[US-4.2] G1: checkbox, multi-select, number, URL, whitespace and built-work errors retain field paths', () => {
  const parsed = submissionDetailsSchema(fields).safeParse({ answers: { consent: false, choices: [], number: '', url: 'bad', text: ' ' }, preexistingIdea: true, builtDuringEvent: ' ' })
  expect(parsed.success).toBe(false)
  if (!parsed.success) {
    expect(parsed.error.issues.map((i) => i.path.join('.'))).toEqual(expect.arrayContaining(['answers.consent', 'answers.choices', 'answers.number', 'answers.url', 'answers.text', 'builtDuringEvent']))
    expect(parsed.error.issues.every((i) => !/Invalid input|expected|undefined/.test(i.message))).toBe(true)
  }
})
test('[US-5.3] G1: optional empty answers and no pre-existing work are valid', () => {
  expect(submissionDetailsSchema(fields.map((f) => ({ ...f, required: false }))).safeParse({ answers: { number: '', url: '', text: '' }, preexistingIdea: false, builtDuringEvent: '' }).success).toBe(true)
})
test('[US-4.2] G1: invalid number is rejected and valid complete answers parse', () => {
  const input = { answers: { consent: true, choices: ['A'], number: '3', url: 'https://example.test', text: 'New work' }, preexistingIdea: true, builtDuringEvent: 'New work' }
  expect(submissionDetailsSchema(fields).safeParse(input).success).toBe(true)
  expect(submissionDetailsSchema(fields).safeParse({ ...input, answers: { ...input.answers, number: 'NaN' } }).success).toBe(false)
})
test('G1/G2: only mapped field messages render; unmapped paths never expose internal keys', () => {
  expect(collectFieldErrors([{ path: ['answers', 'consent'], message: 'Agreement is required' }, { path: ['internal_id'], message: 'Internal failure' }], { 'answers.consent': 'af-consent' })).toEqual({ 'answers.consent': 'Agreement is required', form: 'Check the form and try again.' })
})
test('G1: an invalid choice inside a list points to its question group', () => {
  expect(collectFieldErrors([{ path: ['answers', 'choices', 0], message: 'Technologies: pick one of the options' }], { 'answers.choices': 'ans-choices' })).toEqual({ 'answers.choices': 'Technologies: pick one of the options' })
})
test.each(['', 'bad', 'bad@', '@ab', 'ftp://example.test', 'x'.repeat(321)])('[US-9.3] G3: invalid invite targets stay inline: %s', (value) => expect(inviteTargetError(value)).toBe('Enter an email or @Telegram handle'))
test.each(['builder@example.test', '@builder_rome'])('[US-9.1] G3: valid invite targets use the existing parser: %s', (value) => { expect(inviteTargetError(value)).toBeNull(); expect(parseInviteTarget(value)).not.toBeNull() })
test.each(['not a link', 'ftp://example.test', 'javascript:alert(1)', 'https://' ])('[US-12.3] G4: list URLs reject invalid/protocol input: %s', (value) => {
  expect(projectLinkError('githubRepos', value)).toBeTruthy()
  expect(projectLinkError('demoLinks', value)).toBeTruthy()
})
test('[US-12.3] G4: valid normalized links and video placement match the project schema', () => {
  expect(projectLinkError('githubRepos', 'github.com/example/project')).toBeNull()
  expect(projectLinkError('demoLinks', 'https://example.test/app')).toBeNull()
  expect(projectLinkError('demoLinks', 'https://youtu.be/example')).toBe('Put YouTube and Loom links in the demo video field')
})
