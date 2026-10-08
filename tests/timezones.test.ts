import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isTimeZone, listTimeZones, utcToZoned, zonedToUtc } from '@/lib/timezones'

test('wall time in a zone → UTC, including half-hour offsets', () => {
  assert.equal(zonedToUtc('2026-10-08T11:00', 'Asia/Kolkata')?.toISOString(), '2026-10-08T05:30:00.000Z')
  assert.equal(zonedToUtc('2026-10-08T11:00', 'UTC')?.toISOString(), '2026-10-08T11:00:00.000Z')
  assert.equal(zonedToUtc('2026-01-15T09:30', 'America/New_York')?.toISOString(), '2026-01-15T14:30:00.000Z')
})

test('DST: summer vs winter in Vienna', () => {
  assert.equal(zonedToUtc('2026-07-01T12:00', 'Europe/Vienna')?.toISOString(), '2026-07-01T10:00:00.000Z')
  assert.equal(zonedToUtc('2026-12-01T12:00', 'Europe/Vienna')?.toISOString(), '2026-12-01T11:00:00.000Z')
})

test('round trip UTC → wall time → UTC', () => {
  for (const tz of ['Asia/Kolkata', 'Europe/Istanbul', 'America/Los_Angeles', 'Pacific/Chatham', 'UTC']) {
    const d = new Date('2026-03-29T01:30:00Z')
    assert.equal(zonedToUtc(utcToZoned(d, tz), tz)?.toISOString(), d.toISOString(), tz)
  }
  assert.equal(utcToZoned(new Date('2026-10-08T05:30:00Z'), 'Asia/Kolkata'), '2026-10-08T11:00')
})

test('bad input yields null / empty, unknown zones are rejected', () => {
  assert.equal(zonedToUtc('', 'UTC'), null)
  assert.equal(zonedToUtc('nope', 'UTC'), null)
  assert.equal(zonedToUtc('2026-10-08T11:00', 'Mars/Base'), null)
  assert.equal(utcToZoned(null, 'UTC'), '')
  assert.equal(isTimeZone('Europe/Vienna'), true)
  assert.equal(isTimeZone('Mars/Base'), false)
})

test('zone list starts with UTC and includes all IANA zones once', () => {
  const zones = listTimeZones(new Date('2026-01-01T00:00:00Z'))
  assert.equal(zones[0]!.id, 'UTC')
  assert.ok(zones.length > 300)
  assert.equal(new Set(zones.map((z) => z.id)).size, zones.length)
  assert.equal(zones.find((z) => z.id === 'Asia/Kolkata')?.label, 'UTC+05:30 — Asia/Kolkata')
})
