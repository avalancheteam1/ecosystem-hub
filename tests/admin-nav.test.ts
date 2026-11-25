import { test } from 'vitest'
import assert from 'node:assert/strict'
import { activeAdminHref } from '@/app/admin/_lib/active'
import { visibleAdminNav } from '@/app/admin/_lib/nav'
import { effectivePermissions } from '@/lib/permissions'

test('activeAdminHref: the longest matching nav href wins; /admin only matches itself', () => {
  const hrefs = ['/admin', '/admin/campus', '/admin/campus/organizations', '/admin/tooling']
  assert.equal(activeAdminHref(hrefs, '/admin'), '/admin')
  assert.equal(activeAdminHref(hrefs, '/admin/campus'), '/admin/campus')
  assert.equal(activeAdminHref(hrefs, '/admin/campus/organizations/abc'), '/admin/campus/organizations')
  assert.equal(activeAdminHref(hrefs, '/admin/tooling/xyz'), '/admin/tooling')
  assert.equal(activeAdminHref(hrefs, '/admin/toolingfoo'), null)
  assert.equal(activeAdminHref(hrefs, '/admin/users'), null)
})

test('Grants joins Programs only for reviewers and is active on nested case routes', () => {
  const reviewer = { isSuperAdmin: false, permissions: effectivePermissions([], ['grants.review']) }
  const programs = visibleAdminNav(reviewer).find((group) => group.label === 'Programs')
  const hrefs = programs?.items.map((item) => item.href) ?? []
  assert.deepEqual(hrefs, ['/admin/grants'])
  assert.equal(activeAdminHref(hrefs, '/admin/grants/applications/example'), '/admin/grants')
  const otherStaff = { isSuperAdmin: false, permissions: effectivePermissions([], ['users.view']) }
  assert.equal(visibleAdminNav(otherStaff).some((group) => group.items.some((item) => item.href === '/admin/grants')), false)
})
