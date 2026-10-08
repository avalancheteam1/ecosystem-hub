import { test } from 'vitest'
import assert from 'node:assert/strict'
import { socialPlatform } from '@/components/social-icon'

test('socialPlatform maps hosts (with or without www) and ignores the rest', () => {
  assert.equal(socialPlatform('https://github.com/ava-labs'), 'github')
  assert.equal(socialPlatform('https://www.linkedin.com/in/x'), 'linkedin')
  assert.equal(socialPlatform('https://twitter.com/team1'), 'x')
  assert.equal(socialPlatform('https://t.me/team1'), 'telegram')
  assert.equal(socialPlatform('https://example.com'), null)
  assert.equal(socialPlatform('not a url'), null)
})
