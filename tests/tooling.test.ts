import { test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import content from '@/app/(site)/tooling/_content/tools.json'
import { fold, initials, listHref, matchesQuery, PAGE_SIZE, relatedTools, viewTools, type Tool, type ToolingContent } from '@/app/(site)/tooling/_lib/rules'

const TOOLING: ToolingContent = content

const tool = (slug: string, category: string, extra: Partial<Tool> = {}): Tool => ({
  slug, name: slug, category, purpose: `${slug} purpose`, builder: { name: 'someone' }, licence: 'MIT', language: 'TypeScript',
  install: null, note: null, links: [{ label: 'Code', url: `https://example.com/${slug}` }], checked: '2026-11-03', ...extra,
})
const fixture = (tools: Tool[]): ToolingContent => ({ categories: [{ slug: 'a', label: 'Alpha' }, { slug: 'b', label: 'Beta' }, { slug: 'c', label: 'Empty' }], tools, official: [] })

test('tools.json: every tool is complete, unique and points at a known category', () => {
  const slugs = new Set<string>()
  const categories = new Set(TOOLING.categories.map((c) => c.slug))
  for (const t of TOOLING.tools) {
    assert.match(t.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${t.slug}: slug is lowercase words joined by hyphens`)
    assert.ok(!slugs.has(t.slug), `${t.slug}: slug used twice`)
    slugs.add(t.slug)
    assert.ok(categories.has(t.category), `${t.slug}: unknown category ${t.category}`)
    assert.ok(t.name.trim() && t.purpose.trim() && t.builder.name.trim(), `${t.slug}: name, purpose and builder are required`)
    assert.ok(t.links.length > 0, `${t.slug}: needs at least one link`)
    for (const url of [...t.links.map((l) => l.url), t.builder.url].filter(Boolean)) assert.match(url!, /^https:\/\//, `${t.slug}: ${url} must be https`)
    assert.match(t.checked, /^\d{4}-\d{2}-\d{2}$/, `${t.slug}: checked is YYYY-MM-DD`)
    assert.ok(!Number.isNaN(Date.parse(t.checked)), `${t.slug}: checked is a real date`)
    if (t.logo) {
      assert.match(t.logo, /^\/tooling\/[a-z0-9-]+\.(png|svg|webp)$/, `${t.slug}: logo is a file in public/tooling/`)
      assert.ok(existsSync(`public${t.logo}`), `${t.slug}: ${t.logo} is missing from public/`)
    }
  }
  for (const l of TOOLING.official) assert.match(l.url, /^https:\/\//)
})

test('tools.json: copy has no em dashes', () => {
  assert.ok(!JSON.stringify(TOOLING).includes(String.fromCharCode(0x2014)))
})

test('fold ignores case and accents', () => {
  assert.equal(fold('ÉVALANCHE'), 'evalanche')
  assert.equal(fold('Ça Va'), 'ca va')
})

test('matchesQuery needs every word, in any searchable field', () => {
  const t = tool('wallet-kit', 'a', { purpose: 'Login button for apps', builder: { name: 'iJaack' }, language: 'Python' })
  assert.equal(matchesQuery(t, 'Alpha', undefined), true)
  assert.equal(matchesQuery(t, 'Alpha', '  '), true)
  assert.equal(matchesQuery(t, 'Alpha', 'LOGIN ijaack'), true)
  assert.equal(matchesQuery(t, 'Alpha', 'python alpha'), true)
  assert.equal(matchesQuery(t, 'Alpha', 'login rust'), false)
})

test('viewTools: chips are the categories with tools, counted within the search', () => {
  const c = fixture([tool('one', 'a'), tool('two', 'a', { purpose: 'special' }), tool('three', 'b')])
  const all = viewTools(c, { page: 1 })
  assert.deepEqual(all.chips.map((x) => [x.slug, x.count]), [['a', 2], ['b', 1]])
  assert.equal(all.found, 3)
  const searched = viewTools(c, { q: 'special', page: 1 })
  assert.deepEqual(searched.chips.map((x) => [x.slug, x.count]), [['a', 1], ['b', 0]])
  assert.deepEqual(searched.tools.map((t) => t.slug), ['two'])
})

test('viewTools: unknown category or one without tools falls back to all', () => {
  const c = fixture([tool('one', 'a'), tool('two', 'b')])
  assert.equal(viewTools(c, { category: 'b', page: 1 }).category, 'b')
  assert.deepEqual(viewTools(c, { category: 'b', page: 1 }).tools.map((t) => t.slug), ['two'])
  assert.equal(viewTools(c, { category: 'b', page: 1 }).shown, 1)
  assert.equal(viewTools(c, { page: 1 }).shown, 2)
  for (const category of ['nope', 'c', undefined]) assert.equal(viewTools(c, { category, page: 1 }).category, undefined)
})

test('viewTools: a picked category stays picked when the search finds nothing in it', () => {
  const c = fixture([tool('one', 'a'), tool('two', 'b')])
  const v = viewTools(c, { q: 'two', category: 'a', page: 1 })
  assert.equal(v.category, 'a')
  assert.deepEqual(v.tools, [])
  assert.equal(v.found, 1) // "Search all categories" has something to show
})

test('viewTools: pages of PAGE_SIZE, clamped to the last page', () => {
  const c = fixture(Array.from({ length: PAGE_SIZE + 2 }, (_, i) => tool(`t${i}`, 'a')))
  const p1 = viewTools(c, { page: 1 })
  assert.equal(p1.tools.length, PAGE_SIZE)
  assert.equal(p1.hasMore, true)
  const p2 = viewTools(c, { page: 2 })
  assert.deepEqual(p2.tools.map((t) => t.slug), [`t${PAGE_SIZE}`, `t${PAGE_SIZE + 1}`])
  assert.equal(p2.hasMore, false)
  assert.equal(viewTools(c, { page: 99 }).page, 2)
  assert.equal(viewTools(fixture([]), { page: 3 }).page, 1)
})

test('listHref keeps only set params, URL-encoded', () => {
  assert.equal(listHref({}), '/tooling')
  assert.equal(listHref({ category: 'sdks' }), '/tooling?category=sdks')
  assert.equal(listHref({ q: 'a&b c', category: 'bots' }), '/tooling?q=a%26b+c&category=bots')
})

test('relatedTools: same category, not itself, at most n', () => {
  const tools = [tool('a1', 'a'), tool('b1', 'b'), tool('a2', 'a'), tool('a3', 'a'), tool('a4', 'a')]
  assert.deepEqual(relatedTools(tools, tools[0]).map((t) => t.slug), ['a2', 'a3', 'a4'])
  assert.deepEqual(relatedTools(tools, tools[1]), [])
})

test('initials', () => {
  assert.equal(initials('AVAX Toolkit'), 'AT')
  assert.equal(initials('Wolfie'), 'WO')
  assert.equal(initials('x'), 'X')
  assert.equal(initials('***'), '?')
})
