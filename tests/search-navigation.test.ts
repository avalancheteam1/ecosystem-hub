import assert from 'node:assert/strict'
import { test } from 'vitest'
import { searchHref } from '@/lib/search-navigation'

const path = '/admin/campus/organizations'
const keep = { view: 'university' }

test('submitting the current search from page two keeps the filter and returns to the first page', () => {
  assert.equal(searchHref(path, keep, 'wallet', 'wallet', '?view=university&q=wallet&page=2'), `${path}?view=university&q=wallet`)
})

test('a changed search from page two drops the page and keeps the filter', () => {
  assert.equal(searchHref(path, keep, 'new', 'wallet', '?view=university&q=wallet&page=2'), `${path}?view=university&q=new`)
  assert.equal(searchHref(path, keep, 'new', 'wallet'), `${path}?view=university&q=new`)
})

test('a cleared search keeps only the filter, or the bare path without one', () => {
  assert.equal(searchHref(path, keep, '', 'wallet'), `${path}?view=university`)
  assert.equal(searchHref(path, undefined, '', 'wallet'), path)
})

test('an unchanged search does not navigate on first-page submit or while typing', () => {
  assert.equal(searchHref(path, keep, 'wallet', 'wallet', '?q=wallet&page=1'), null)
  assert.equal(searchHref(path, keep, 'wallet', 'wallet'), null)
})
