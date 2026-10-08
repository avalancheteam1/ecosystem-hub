import { test } from 'vitest'
import assert from 'node:assert/strict'
import { hasCompleteBasicProfile, profileSchema } from '@/lib/profile'

const base = { name: 'Ada', username: '', bio: '', country: 'AT', builderRoles: ['developer'], institution: '', companyName: '', employeeRole: '', githubAccount: '', xAccount: '', linkedinAccount: '', telegramAccount: '', otherSocials: [], wallets: [], skills: [], newsletterOptIn: false, image: null }

test('social handles use the builders-hub patterns and normalise', () => {
  const p = profileSchema.parse({ ...base, githubAccount: 'https://github.com/ada-l', xAccount: '@ada', telegramAccount: '@ada_dev', linkedinAccount: 'https://www.linkedin.com/in/ada' })
  assert.deepEqual([p.githubAccount, p.xAccount, p.telegramAccount], ['ada-l', 'ada', 'ada_dev'])
  assert.equal(profileSchema.safeParse({ ...base, telegramAccount: 'abc' }).success, false) // too short
  assert.equal(profileSchema.safeParse({ ...base, githubAccount: '-bad-' }).success, false)
  assert.equal(profileSchema.safeParse({ ...base, linkedinAccount: 'https://evil.io/in/x' }).success, false)
  assert.equal(profileSchema.safeParse({ ...base, xAccount: 'waytoolonghandle123' }).success, false)
})

test('bio max 250, unknown country and role rejected, skills deduped', () => {
  assert.equal(profileSchema.safeParse({ ...base, bio: 'x'.repeat(251) }).success, false)
  assert.equal(profileSchema.safeParse({ ...base, country: 'XX' }).success, false)
  assert.equal(profileSchema.safeParse({ ...base, builderRoles: ['wizard'] }).success, false)
  assert.deepEqual(profileSchema.parse({ ...base, skills: ['Solidity', 'solidity ', 'Rust'] }).skills, ['Solidity', 'Rust'])
})

test('username: lowercase handle, 3–30 chars', () => {
  assert.equal(profileSchema.parse({ ...base, username: 'Ada_L' }).username, 'ada_l')
  assert.equal(profileSchema.safeParse({ ...base, username: 'ab' }).success, false)
  assert.equal(profileSchema.parse({ ...base, username: '' }).username, null)
})

test('basic profile = name + country + at least one role', () => {
  assert.equal(hasCompleteBasicProfile({ name: 'Ada', country: 'AT', builderRoles: ['founder'] }), true)
  assert.equal(hasCompleteBasicProfile({ name: 'Ada', country: null, builderRoles: ['founder'] }), false)
  assert.equal(hasCompleteBasicProfile({ name: 'Ada', country: 'AT', builderRoles: [] }), false)
})
