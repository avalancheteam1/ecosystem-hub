import { test } from 'vitest'
import assert from 'node:assert/strict'
import { wasReplaced } from '@/app/(app)/projects/_lib/rules'
import {
  approveProblem, closedState, fold, initials, listingProblems, matchesQuery, newerVersion, PAGE_SIZE, SEAL_NOTE, TOOLING_CATEGORY, TOOLING_CONSENT,
  submitBlock, toolLinks, viewTools, visibleRejectReason, type ListingState,
} from '@/app/(site)/tooling/_lib/rules'

const version = (extra: Partial<Parameters<typeof listingProblems>[0] & { id: string; number: number; sealedAt: Date | null }> = {}) => ({
  categories: [TOOLING_CATEGORY], maturity: 'live', fullDescription: 'Full', techDescription: 'How', techStack: ['TypeScript'],
  githubRepos: ['https://github.com/a/b'], demoLinks: [], websiteUrl: 'https://a.dev', id: 'v3', number: 3, sealedAt: new Date('2026-11-20'), ...extra,
})
const ref = (number: number) => ({ id: `v${number}`, number })
const listing = (extra: Partial<ListingState> = {}): ListingState => ({ closedAt: null, approvedVersion: null, pendingVersion: null, ...extra })

test('listingProblems: Developer Tooling, live or established, and a complete project', () => {
  assert.deepEqual(listingProblems(version()), [])
  assert.deepEqual(listingProblems(version({ maturity: 'established' })), [])
  assert.deepEqual(listingProblems(version({ categories: ['DeFi'] })), [`Category “${TOOLING_CATEGORY}”`])
  assert.match(listingProblems(version({ maturity: 'testnet' }))[0], /^Stage Live or Established \(it is Testnet/)
  assert.match(listingProblems(version({ maturity: 'archived' }))[0], /it is Archived/)
  assert.deepEqual(listingProblems(version({ maturity: null })), ['Project stage']) // no doubled stage message
  assert.deepEqual(listingProblems(version({ githubRepos: [], websiteUrl: null })), ['Code repository', 'Website or demo link'])
})

test('newerVersion: only a sealed version newer than both the listed and the pending one, on an open listing', () => {
  assert.equal(newerVersion(listing({ approvedVersion: ref(2) }), ref(3))?.number, 3)
  assert.equal(newerVersion(listing({ approvedVersion: ref(2), pendingVersion: ref(3) }), ref(3)), null)
  assert.equal(newerVersion(listing({ approvedVersion: ref(2), pendingVersion: ref(3) }), ref(4))?.number, 4)
  assert.equal(newerVersion(listing({ approvedVersion: ref(3) }), ref(3)), null)
  assert.equal(newerVersion(listing({ approvedVersion: ref(2) }), null), null)
  assert.equal(newerVersion(listing(), ref(5)), null) // rejected or never reviewed: the team submits again
  assert.equal(newerVersion(listing({ approvedVersion: ref(2), closedAt: new Date() }), ref(5)), null)
  assert.equal(newerVersion(listing({ approvedVersion: ref(2), rejectedVersionId: 'v3' }), ref(3)), null) // just rejected
})

test('approveProblem: sealed, newer than the listed one, still listable, open listing', () => {
  const pending = listing({ pendingVersion: ref(3) })
  assert.equal(approveProblem(pending, version(), false), null)
  assert.equal(approveProblem(listing({ approvedVersion: ref(2) }), version(), false), null) // newer version without a resubmit
  assert.match(approveProblem(pending, version({ sealedAt: null }), false)!, /not the draft/)
  assert.match(approveProblem(pending, version(), true)!, /deleted/)
  assert.match(approveProblem(listing({ pendingVersion: ref(3), closedAt: new Date() }), version(), false)!, /withdrawn or removed/)
  assert.match(approveProblem(listing(), version(), false)!, /Nothing is waiting/)
  assert.match(approveProblem(listing({ approvedVersion: ref(3) }), version(), false)!, /not newer/)
  assert.match(approveProblem(listing({ approvedVersion: ref(1), pendingVersion: ref(4) }), version(), false)!, /newer version \(4\)/)
  assert.match(approveProblem(pending, version({ maturity: 'archived' }), false)!, /still needs: Stage/)
  assert.match(approveProblem(listing({ approvedVersion: ref(2), rejectedVersionId: 'v3' }), version(), false)!, /was rejected/) // same rule as the hidden "newer"
})

test('submitBlock: listed, waiting or rejected versions need an edit first; closed listings start over', () => {
  const l = (extra = {}) => ({ closedAt: null, approvedVersionId: null, pendingVersionId: null, rejectedVersionId: null, ...extra })
  assert.equal(submitBlock(null, 'v1'), null)
  assert.equal(submitBlock(l(), 'v1'), null)
  assert.match(submitBlock(l({ approvedVersionId: 'v1' }), 'v1')!, /is listed/)
  assert.match(submitBlock(l({ pendingVersionId: 'v1' }), 'v1')!, /waiting for review/)
  assert.match(submitBlock(l({ rejectedVersionId: 'v1' }), 'v1')!, /wasn’t approved/)
  assert.match(submitBlock(l({ rejectedVersionId: 'v1', closedAt: new Date() }), 'v1')!, /wasn’t approved/) // withdrawing doesn't clear a rejection
  assert.equal(submitBlock(l({ approvedVersionId: 'v1', closedAt: new Date() }), 'v1'), null) // withdrawn: listing again needs review
  assert.equal(submitBlock(l({ approvedVersionId: 'v1', rejectedVersionId: 'v2' }), 'v3'), null)
})

test('closedState: a removal shows the reviewer and reason to the team; a withdraw shows no reason', () => {
  const now = new Date()
  assert.equal(closedState({ closedAt: null, closedReason: null, closedNote: null }), null)
  assert.deepEqual(closedState({ closedAt: now, closedReason: 'removed', closedNote: 'Repo was deleted' }), { by: 'reviewer', reason: 'Repo was deleted' })
  assert.deepEqual(closedState({ closedAt: now, closedReason: 'withdrawn', closedNote: null }), { by: 'team', reason: null })
})

test('visibleRejectReason hides internal reasons from the team', () => {
  assert.equal(visibleRejectReason({ rejectReason: 'Repo is private', rejectReasonInternal: false }), 'Repo is private')
  assert.equal(visibleRejectReason({ rejectReason: 'Looks like spam', rejectReasonInternal: true }), null)
  assert.equal(visibleRejectReason({ rejectReason: null, rejectReasonInternal: false }), null)
})

test('a tooling seal is never labelled "replaced" on the project page', () => {
  assert.equal(wasReplaced({ sealedAt: new Date(), note: SEAL_NOTE, entries: 0 }), false)
})

test('consent wording names the public list and later versions', () => {
  assert.match(TOOLING_CONSENT, /listed publicly on \/tooling/)
  assert.match(TOOLING_CONSENT, /later versions approved by team1/)
})

test('fold and matchesQuery: every word, any field, case and accents ignored', () => {
  assert.equal(fold('ÉVALANCHE'), 'evalanche')
  assert.equal(matchesQuery(['Wallet Kit', 'Login button for apps'], undefined), true)
  assert.equal(matchesQuery(['Wallet Kit', 'Login button for apps'], '  '), true)
  assert.equal(matchesQuery(['Wallet Kit', 'Login button for apps'], 'LOGIN kit'), true)
  assert.equal(matchesQuery(['Wallet Kit', 'Login button for apps'], 'login rust'), false)
})

test('viewTools: search on name and short description, pages of PAGE_SIZE, clamped', () => {
  const tools = Array.from({ length: PAGE_SIZE + 2 }, (_, i) => ({ slug: `t${i}`, name: `Tool ${i}`, shortDescription: i === 5 ? 'special' : 'plain', logoUrl: null }))
  const p1 = viewTools(tools, { page: 1 })
  assert.equal(p1.tools.length, PAGE_SIZE)
  assert.equal(p1.hasMore, true)
  assert.equal(p1.found, PAGE_SIZE + 2)
  assert.deepEqual(viewTools(tools, { page: 2 }).tools.map((t) => t.slug), [`t${PAGE_SIZE}`, `t${PAGE_SIZE + 1}`])
  assert.equal(viewTools(tools, { page: 99 }).page, 2)
  assert.deepEqual(viewTools(tools, { q: 'special', page: 1 }).tools.map((t) => t.slug), ['t5'])
  assert.equal(viewTools([], { page: 3 }).page, 1)
})

test('toolLinks: website first, then code, demos, video, other sites; duplicates and non-http dropped', () => {
  assert.deepEqual(
    toolLinks({
      websiteUrl: 'https://a.dev', githubRepos: ['https://github.com/a/b', 'https://github.com/a/c'], demoLinks: ['https://a.dev'], videoUrl: 'https://youtu.be/x',
      websites: [{ tag: 'Docs', url: 'https://docs.a.dev' }, { tag: ' ', url: 'https://blog.a.dev' }, { tag: 'Bad', url: 'javascript:alert(1)' }],
    }),
    [
      { label: 'Website', url: 'https://a.dev' },
      { label: 'Code 1', url: 'https://github.com/a/b' },
      { label: 'Code 2', url: 'https://github.com/a/c' },
      { label: 'Video', url: 'https://youtu.be/x' },
      { label: 'Docs', url: 'https://docs.a.dev' },
      { label: 'Link', url: 'https://blog.a.dev' },
    ],
  )
  assert.deepEqual(toolLinks({ websiteUrl: null, githubRepos: ['https://github.com/a/b'], demoLinks: [], videoUrl: null, websites: null }), [{ label: 'Code', url: 'https://github.com/a/b' }])
})

test('initials', () => {
  assert.equal(initials('AVAX Toolkit'), 'AT')
  assert.equal(initials('Wolfie'), 'WO')
  assert.equal(initials('***'), '?')
})
