import { test } from 'vitest'
import assert from 'node:assert/strict'
import { formatEventDate, formatEventRange } from '@/lib/dates'

const ist = 'Asia/Kolkata'

test('same-day range shows one date and both times in the event zone', () => {
  assert.equal(
    formatEventRange(new Date('2026-10-08T05:30:00Z'), new Date('2026-10-08T08:30:00Z'), ist),
    'Thu, Oct 8, 2026, 11:00 AM – 2:00 PM GMT+5:30',
  )
})

test('multi-day range shows both dates', () => {
  assert.equal(
    formatEventRange(new Date('2026-11-14T08:00:00Z'), new Date('2026-11-16T17:00:00Z'), 'Europe/Istanbul'),
    'Sat, Nov 14 – Mon, Nov 16, 2026',
  )
})

test('missing end and bad zones degrade gracefully', () => {
  assert.equal(formatEventRange(new Date('2026-10-08T05:30:00Z'), null, ist), 'Thu, Oct 8, 2026, 11:00 AM GMT+5:30')
  assert.equal(formatEventDate(new Date('2026-10-08T05:30:00Z'), 'Not/AZone'), 'Thu, Oct 8, 2026')
})

test('formatRelative: largest whole unit, past and future', async () => {
  const { formatRelative } = await import('@/lib/dates')
  const now = new Date('2026-10-09T12:00:00Z')
  assert.equal(formatRelative(new Date('2026-10-06T12:00:00Z'), now), '3 days ago')
  assert.equal(formatRelative(new Date('2026-10-09T14:30:00Z'), now), 'in 2 hours')
  assert.equal(formatRelative(new Date('2026-10-08T12:00:00Z'), now), 'yesterday')
  assert.equal(formatRelative(new Date('2026-10-09T11:59:30Z'), now), 'just now')
})
