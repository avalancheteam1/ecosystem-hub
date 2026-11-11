import { test } from 'vitest'
import assert from 'node:assert/strict'
import { rejectedTarget, rejectsNext, safeNext } from '@/lib/safe-next'

test('keeps same-site relative paths', () => {
  assert.equal(safeNext('/admin/users?q=a'), '/admin/users?q=a')
})

test('rejects anything that could leave the site', () => {
  for (const bad of ['https://evil.io', '//evil.io', '/\\evil.io', '/\t/evil.io', '/\n/evil.io', '/\r//evil.io', '/.//evil.io', '/..//evil.io', '/a/..//evil.io', 'javascript:alert(1)', 'admin', '']) {
    assert.equal(safeNext(bad), '/dashboard', bad)
  }
  assert.equal(safeNext(null), '/dashboard')
  assert.equal(safeNext(undefined), '/dashboard')
})

test('rejectsNext flags external and protocol-relative targets only', () => {
  for (const bad of ['//evil.io', 'https://evil.io', '/\t/evil.io']) assert.equal(rejectsNext(bad), true, bad)
  for (const ok of ['/events', '', undefined, null]) assert.equal(rejectsNext(ok), false)
})

test('rejectedTarget keeps only the host or scheme, never path or query', () => {
  assert.equal(rejectedTarget('https://evil.io/cb?code=secret&email=a@x.io'), 'evil.io')
  assert.equal(rejectedTarget('//evil.io/x?token=t'), 'evil.io')
  assert.equal(rejectedTarget('/\t/evil.io/x'), 'evil.io')
  assert.equal(rejectedTarget('https://user:pw@evil.io/'), 'evil.io')
  assert.equal(rejectedTarget('javascript:alert(document.cookie)'), 'javascript:')
  assert.equal(rejectedTarget('/.//evil.io'), 'path-trick')
})
