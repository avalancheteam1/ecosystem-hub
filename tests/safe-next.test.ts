import { test } from 'vitest'
import assert from 'node:assert/strict'
import { safeNext } from '@/lib/safe-next'

test('keeps same-site relative paths', () => {
  assert.equal(safeNext('/admin/users?q=a'), '/admin/users?q=a')
})

test('rejects anything that could leave the site', () => {
  for (const bad of ['https://evil.io', '//evil.io', '/\\evil.io', '/\t/evil.io', '/\n/evil.io', '/\r//evil.io', 'javascript:alert(1)', 'admin', '']) {
    assert.equal(safeNext(bad), '/dashboard', bad)
  }
  assert.equal(safeNext(null), '/dashboard')
  assert.equal(safeNext(undefined), '/dashboard')
})
