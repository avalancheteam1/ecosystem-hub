import { test } from 'vitest'
import assert from 'node:assert/strict'
import { missingForSubmission, projectFieldsSchema, versionChanged, type ProjectFieldsInput } from '@/app/(app)/projects/_lib/rules'

const base: ProjectFieldsInput = {
  name: 'Snowpay', shortDescription: 'Pay with AVAX in one tap', fullDescription: 'A wallet-less checkout.', techDescription: 'Next.js + Solidity',
  techStack: ['Solidity', 'Next.js'], categories: ['DeFi'], otherCategory: '', githubRepos: ['https://github.com/x/snowpay'], demoLinks: [],
  videoUrl: '', logoUrl: null, coverUrl: null, screenshots: [], deployedAddresses: [], websites: [], socials: [],
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

test('versionChanged is false for an identical save and true for any field change', () => {
  const a = projectFieldsSchema.parse(base)
  assert.equal(versionChanged(a, projectFieldsSchema.parse({ ...base, techStack: [...base.techStack!] })), false)
  assert.equal(versionChanged(a, projectFieldsSchema.parse({ ...base, shortDescription: 'New' })), true)
  assert.equal(versionChanged(a, projectFieldsSchema.parse({ ...base, websites: [{ tag: 'Docs', url: 'https://d.io' }] })), true)
  assert.equal(versionChanged(null, a), true)
})

test('submission readiness lists what is missing (builders-hub required set)', () => {
  const v = { fullDescription: '', techDescription: '', techStack: [], githubRepos: [], demoLinks: [] }
  assert.deepEqual(missingForSubmission(v), ['Full description', 'How it’s made', 'Tech stack', 'Code repository', 'Demo link'])
  assert.deepEqual(missingForSubmission({ fullDescription: 'x', techDescription: 'y', techStack: ['Solidity'], githubRepos: ['https://github.com/a/b'], demoLinks: ['https://a.io'] }), [])
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
