import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { test, vi } from 'vitest'
import EventsPage from '@/app/(site)/events/page'

// No database in the unit suite; exercise the page and its real links with an empty query result.
vi.mock('@/app/(site)/events/_lib/queries', () => ({ listPublicEvents: async () => [] }))

test('an empty later events page links back to page one with both filters intact', async () => {
  const page = await EventsPage({ searchParams: Promise.resolve({ when: 'past', type: 'hackathons', page: '9' }) })
  const html = renderToStaticMarkup(page)

  assert.match(html, /href="\/events\?when=past&amp;type=hackathons"[^>]*>Back to first page<\/a>/)
  assert.doesNotMatch(html, /No past hackathons yet\.|>Previous<\/a>/)
})

test('an empty first events page still reports that no events match', async () => {
  const page = await EventsPage({ searchParams: Promise.resolve({ when: 'past' }) })
  const html = renderToStaticMarkup(page)

  assert.match(html, /No past events yet\./)
  assert.doesNotMatch(html, /Back to first page/)
})
