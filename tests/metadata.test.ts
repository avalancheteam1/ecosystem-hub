import { test } from 'vitest'
import assert from 'node:assert/strict'
import { canonical, plainText } from '@/lib/metadata'

test('plainText keeps link text and hyphens, drops markup, URLs and line breaks', () => {
  assert.equal(plainText('## On-chain *build*\n\nSee [the docs](https://x.io) or https://y.io now.'), 'On-chain build See the docs or now.')
  assert.equal(plainText('a'.repeat(200)).length, 160)
  assert.equal(plainText(''), '')
})

test('canonical keeps the shared Open Graph fields next to page-specific ones', () => {
  assert.deepEqual(canonical('/events/x', { images: ['c.png'] }), {
    alternates: { canonical: '/events/x' },
    openGraph: { type: 'website', siteName: 'team1 Ecosystem Hub', images: ['c.png'], url: '/events/x' },
  })
  assert.deepEqual(canonical('/').openGraph?.images, { url: '/opengraph-image', width: 1200, height: 630, alt: 'team1 Ecosystem Hub', type: 'image/png' })
})
