import { test } from 'vitest'
import assert from 'node:assert/strict'
import { slugify, withSuffix } from '@/lib/slug'

test('slugify makes readable kebab-case, transliterating accents', () => {
  assert.equal(slugify('Team1 Istanbul Hack 2026!'), 'team1-istanbul-hack-2026')
  assert.equal(slugify('  Ünïcödé — Café  '), 'unicode-cafe')
  assert.equal(slugify('🚀🚀'), '')
})

test('slugify caps length at a word boundary-ish 60 chars', () => {
  assert.ok(slugify('word '.repeat(40)).length <= 60)
  assert.ok(!slugify('word '.repeat(40)).endsWith('-'))
})

test('withSuffix appends a short id and falls back when empty', () => {
  assert.equal(withSuffix('team1-hack', 'x7k2'), 'team1-hack-x7k2')
  assert.equal(withSuffix('', 'x7k2'), 'x7k2')
})
