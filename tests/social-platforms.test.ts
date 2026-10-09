import { test } from 'vitest'
import assert from 'node:assert/strict'
import { detectPlatform, socialLabel } from '@/lib/social-platforms'

test('detectPlatform: by host, any subdomain, with or without scheme', () => {
  assert.equal(detectPlatform('https://x.com/team1'), 'x')
  assert.equal(detectPlatform('https://twitter.com/team1'), 'x')
  assert.equal(detectPlatform('https://www.linkedin.com/company/team1'), 'linkedin')
  assert.equal(detectPlatform('linkedin.com/in/someone'), 'linkedin')
  assert.equal(detectPlatform('https://t.me/team1'), 'telegram')
  assert.equal(detectPlatform('https://discord.gg/abc'), 'discord')
  assert.equal(detectPlatform('https://youtu.be/abc'), 'youtube')
  assert.equal(detectPlatform('https://team1.medium.com/post'), 'medium')
  assert.equal(detectPlatform('https://bsky.app/profile/team1'), 'bluesky')
  assert.equal(detectPlatform('https://warpcast.com/team1'), 'farcaster')
})

test('detectPlatform: unknown or look-alike hosts are null', () => {
  assert.equal(detectPlatform('https://example.com'), null)
  assert.equal(detectPlatform('https://notx.com/a'), null)
  assert.equal(detectPlatform('https://x.com.evil.io/a'), null)
  assert.equal(detectPlatform(''), null)
  assert.equal(detectPlatform('not a url'), null)
})

test('socialLabel: platform name, old free-text tag as written, else host', () => {
  assert.equal(socialLabel({ tag: 'linkedin', url: 'https://linkedin.com/x' }), 'LinkedIn')
  assert.equal(socialLabel({ tag: 'Our Twitter', url: 'https://twitter.com/x' }), 'Our Twitter')
  assert.equal(socialLabel({ tag: 'other', url: 'https://www.example.com/a' }), 'example.com')
  assert.equal(socialLabel({ tag: '', url: 'https://example.com' }), 'example.com')
})
