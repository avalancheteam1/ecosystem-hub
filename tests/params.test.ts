import { test } from 'vitest'
import assert from 'node:assert/strict'
import { pageParam, textParam } from '@/lib/params'

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
