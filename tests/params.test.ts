import { test } from 'vitest'
import assert from 'node:assert/strict'
import { pageParam, sortParams, textParam } from '@/lib/params'

test('textParam takes the first value of repeated params and trims', () => {
  assert.equal(textParam(' bob '), 'bob')
  assert.equal(textParam(['a', 'b']), 'a')
  assert.equal(textParam(undefined), undefined)
  assert.equal(textParam('   '), undefined)
  assert.equal(textParam('x'.repeat(500))?.length, 100)
})

test('pageParam is a positive integer capped at 10000', () => {
  assert.equal(pageParam('3'), 3)
  assert.equal(pageParam(['2', '5']), 2)
  for (const bad of [undefined, '0', '-1', '1.5', 'abc']) assert.equal(pageParam(bad), 1, String(bad))
  assert.equal(pageParam('1e20'), 10_000)
})

test('sortParams only accepts whitelisted keys, dir defaults to desc', () => {
  const fallback = { key: 'createdAt', dir: 'desc' } as const
  const keys = ['name', 'createdAt'] as const
  assert.deepEqual(sortParams({ sort: 'name', dir: 'asc' }, keys, fallback), { key: 'name', dir: 'asc' })
  assert.deepEqual(sortParams({ sort: 'name', dir: 'sideways' }, keys, fallback), { key: 'name', dir: 'desc' })
  assert.deepEqual(sortParams({ sort: 'passwordHash', dir: 'asc' }, keys, fallback), fallback)
  assert.deepEqual(sortParams({ sort: ['name', 'x'] }, keys, fallback), fallback)
  assert.deepEqual(sortParams({}, keys, fallback), fallback)
})
