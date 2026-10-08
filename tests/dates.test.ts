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
