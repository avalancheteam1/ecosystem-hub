import { test } from 'vitest'
import assert from 'node:assert/strict'
import { ASSIGNABLE_ROLES, canEditProject, canManageTeam, milestoneDoneAt, missingForSubmission, versionChanged } from '@/app/(app)/projects/_lib/rules'
import { milestoneSchema, projectFieldsSchema, type ProjectFieldsInput } from '@/app/(app)/projects/_lib/schemas'

const base: ProjectFieldsInput = {
  name: 'Snowpay', shortDescription: 'Pay with AVAX in one tap', fullDescription: 'A wallet-less checkout.', techDescription: 'Next.js + Solidity',
  techStack: ['Solidity', 'Next.js'], categories: ['DeFi'], otherCategory: '', maturity: 'prototype', githubRepos: ['https://github.com/x/snowpay'], demoLinks: [],
  videoUrl: '', logoUrl: null, coverUrl: null, screenshots: [], deployedAddresses: [], websiteUrl: null, websites: [], socials: [],
}
const parse = (o: Partial<ProjectFieldsInput>) => projectFieldsSchema.safeParse({ ...base, ...o })

test('trims, normalises links like builders-hub, dedupes tech stack', () => {
  const p = projectFieldsSchema.parse({ ...base, name: '  Snowpay ', githubRepos: ['github.com/x/snowpay'], techStack: ['Solidity', ' solidity', ''] })
  assert.equal(p.name, 'Snowpay')
  assert.deepEqual(p.githubRepos, ['https://github.com/x/snowpay'])
  assert.deepEqual(p.techStack, ['Solidity'])
  assert.equal(p.videoUrl, null)
})

test('links: http(s) only, no duplicates, video hosts restricted, Loom not a demo link', () => {
  assert.equal(parse({ githubRepos: ['javascript:alert(1)'] }).success, false)
  assert.equal(parse({ githubRepos: ['https://github.com/a/b', 'https://GITHUB.com/a/b'] }).success, false)
  assert.equal(parse({ videoUrl: 'https://evil.io/v' }).success, false)
  assert.equal(parse({ videoUrl: 'https://youtu.be/abc' }).success, true)
  assert.equal(parse({ demoLinks: ['https://www.loom.com/share/x'] }).success, false)
})

test('limits from builders-hub: name 60, short 280, 5 screenshots, other category needs text', () => {
  assert.equal(parse({ name: 'x'.repeat(61) }).success, false)
  assert.equal(parse({ shortDescription: 'x'.repeat(281) }).success, false)
  assert.equal(parse({ screenshots: Array.from({ length: 6 }, (_, i) => `https://a.io/${i}.png`) }).success, false)
  assert.equal(parse({ categories: ['Other (Specify)'] }).success, false)
  assert.equal(parse({ categories: ['Other (Specify)'], otherCategory: 'Infra' }).success, true)
  assert.equal(parse({ categories: ['Memes'] as never }).success, false)
})

test('project stage is required and limited to the known stages', () => {
  assert.equal(parse({ maturity: undefined }).success, false)
  assert.equal(parse({ maturity: '' as never }).success, false)
  assert.equal(projectFieldsSchema.parse({ ...base, maturity: 'mvp' }).maturity, 'mvp')
  assert.equal(parse({ maturity: 'unicorn' as never }).success, false)
  assert.equal(versionChanged(projectFieldsSchema.parse(base), projectFieldsSchema.parse({ ...base, maturity: 'live' })), true)
})

test('country is optional, an ISO-2 code from the list, and versioned', () => {
  assert.equal(projectFieldsSchema.parse(base).country, null)
  assert.equal(projectFieldsSchema.parse({ ...base, country: '' }).country, null)
  assert.equal(projectFieldsSchema.parse({ ...base, country: 'AT' }).country, 'AT')
  assert.equal(parse({ country: 'Austria' }).success, false)
  assert.equal(versionChanged(projectFieldsSchema.parse(base), projectFieldsSchema.parse({ ...base, country: 'AT' })), true)
})

test('versionChanged is false for an identical save and true for any field change', () => {
  const a = projectFieldsSchema.parse(base)
  assert.equal(versionChanged(a, projectFieldsSchema.parse({ ...base, techStack: [...base.techStack!] })), false)
  assert.equal(versionChanged(a, projectFieldsSchema.parse({ ...base, shortDescription: 'New' })), true)
  assert.equal(versionChanged(a, projectFieldsSchema.parse({ ...base, websites: [{ tag: 'Docs', url: 'https://d.io' }] })), true)
  assert.equal(versionChanged(null, a), true)
})

test('submission readiness lists what is missing (builders-hub required set)', () => {
  const v = { maturity: null, fullDescription: '', techDescription: '', techStack: [], githubRepos: [], demoLinks: [], websiteUrl: null }
  assert.deepEqual(missingForSubmission(v), ['Project stage', 'Full description', 'How it’s made', 'Tech stack', 'Code repository', 'Website or demo link'])
  assert.deepEqual(missingForSubmission({ maturity: 'mvp', fullDescription: 'x', techDescription: 'y', techStack: ['Solidity'], githubRepos: ['https://github.com/a/b'], demoLinks: ['https://a.io'], websiteUrl: null }), [])
  const rest = { maturity: 'mvp', fullDescription: 'x', techDescription: 'y', techStack: ['Solidity'], githubRepos: ['https://github.com/a/b'] }
  assert.deepEqual(missingForSubmission({ ...rest, demoLinks: [], websiteUrl: 'https://a.io' }), [], 'a website stands in for a demo link')
  assert.deepEqual(missingForSubmission({ ...rest, demoLinks: [], websiteUrl: null }), ['Website or demo link'])
})

test('saving: no-op when unchanged, edit the draft in place, or start a new draft after a sealed version', async () => {
  const { planSave } = await import('@/app/(app)/projects/_lib/rules')
  assert.equal(planSave({ sealedAt: null }, false), 'noop')
  assert.equal(planSave({ sealedAt: null }, true), 'update-draft')
  assert.equal(planSave({ sealedAt: new Date() }, true), 'new-draft')
  assert.equal(planSave({ sealedAt: new Date() }, false), 'noop')
})

test('submitting seals the draft, or reuses the last sealed version when nothing changed', async () => {
  const { planSeal } = await import('@/app/(app)/projects/_lib/rules')
  assert.equal(planSeal({ sealedAt: null }), 'seal-draft')
  assert.equal(planSeal({ sealedAt: new Date() }), 'reuse-sealed')
})

test('version label hides drafts behind the next number', async () => {
  const { versionLabel } = await import('@/app/(app)/projects/_lib/rules')
  assert.equal(versionLabel({ number: 1, sealedAt: null }), 'Version 1 · draft')
  assert.equal(versionLabel({ number: 2, sealedAt: new Date() }), 'Version 2')
})

test('socials: a known platform key the user picked is kept; otherwise the platform is detected from the URL', () => {
  const p = projectFieldsSchema.parse({ ...base, socials: [{ tag: 'Twitter', url: 'x.com/snowpay' }, { tag: 'linkedin', url: 'https://example.com' }, { url: 'https://www.linkedin.com/company/snowpay' }, { tag: 'nonsense', url: 'https://example.org' }] })
  assert.deepEqual(p.socials, [
    { tag: 'x', url: 'https://x.com/snowpay' },
    { tag: 'linkedin', url: 'https://example.com' },
    { tag: 'linkedin', url: 'https://www.linkedin.com/company/snowpay' },
    { tag: 'other', url: 'https://example.org' },
  ])
})

test('launch date is an optional real calendar day', () => {
  assert.equal(projectFieldsSchema.parse(base).launchDate, null)
  assert.equal(projectFieldsSchema.parse({ ...base, launchDate: '' }).launchDate, null)
  assert.equal(projectFieldsSchema.parse({ ...base, launchDate: '2025-11-03' }).launchDate, '2025-11-03')
  assert.equal(parse({ launchDate: '2025-02-30' }).success, false)
  assert.equal(parse({ launchDate: '03.11.2025' }).success, false)
})

test('deployed addresses get a network, C-Chain by default', () => {
  const p = projectFieldsSchema.parse({ ...base, deployedAddresses: [{ tag: 'Token', address: '0xabc' }, { tag: '', address: '0xdef', network: 'fuji' }] })
  assert.deepEqual(p.deployedAddresses.map((a) => a.network), ['c-chain', 'fuji'])
  assert.equal(parse({ deployedAddresses: [{ tag: '', address: '0x1', network: 'solana' as never }] }).success, false)
})

test('archived is a project stage', () => {
  assert.equal(projectFieldsSchema.parse({ ...base, maturity: 'archived' }).maturity, 'archived')
})

test('milestones need a title and a real target date; status defaults to planned', () => {
  const m = milestoneSchema.parse({ title: ' Mainnet ', targetDate: '2027-01-31' })
  assert.deepEqual(m, { title: 'Mainnet', description: null, targetDate: '2027-01-31', status: 'planned' })
  assert.equal(milestoneSchema.safeParse({ title: '', targetDate: '2027-01-31' }).success, false)
  assert.equal(milestoneSchema.safeParse({ title: 'x', targetDate: '' }).success, false)
  assert.equal(milestoneSchema.safeParse({ title: 'x', targetDate: '2027-01-31', status: 'shipped' }).success, false)
})

test('milestone doneAt is stamped on done, kept while done, cleared otherwise', () => {
  const now = new Date('2026-10-09T10:00:00Z')
  const earlier = new Date('2026-09-01T10:00:00Z')
  assert.equal(milestoneDoneAt(null, 'done', now), now)
  assert.equal(milestoneDoneAt({ status: 'planned', doneAt: null }, 'done', now), now)
  assert.equal(milestoneDoneAt({ status: 'done', doneAt: earlier }, 'done', now), earlier)
  assert.equal(milestoneDoneAt({ status: 'done', doneAt: earlier }, 'in_progress', now), null)
})

test('team roles: readers view, writers edit + submit, only the owner manages the team', () => {
  assert.deepEqual(['owner', 'writer', 'reader'].map(canEditProject), [true, true, false])
  assert.deepEqual(['owner', 'writer', 'reader'].map(canManageTeam), [true, false, false])
  assert.equal(canEditProject('member'), false) // unknown/legacy roles get nothing
  assert.ok(!(ASSIGNABLE_ROLES as readonly string[]).includes('owner')) // ownership moves only by transfer
})

test('wasReplaced: only submission-sealed versions that lost their stage entries', async () => {
  const { wasReplaced, submissionNote } = await import('@/app/(app)/projects/_lib/rules')
  const sealedAt = new Date()
  const note = submissionNote('Hackathon A')
  assert.equal(wasReplaced({ sealedAt, note, entries: 0 }), true)
  assert.equal(wasReplaced({ sealedAt, note, entries: 1 }), false)
  assert.equal(wasReplaced({ sealedAt, note: 'Added mainnet deploy', entries: 0 }), false)
  assert.equal(wasReplaced({ sealedAt: null, note: null, entries: 0 }), false)
})
