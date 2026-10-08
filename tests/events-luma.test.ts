import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapLumaEvent, parseLumaRef } from '@/app/(site)/events/_lib/luma'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/luma-event.json', import.meta.url), 'utf8'))

test('parseLumaRef accepts Luma links, bare slugs and evt- ids', () => {
  assert.equal(parseLumaRef('https://luma.com/y9koun3u'), 'y9koun3u')
  assert.equal(parseLumaRef('https://lu.ma/y9koun3u?tk=abc'), 'y9koun3u')
  assert.equal(parseLumaRef('www.luma.com/y9koun3u/'), 'y9koun3u')
  assert.equal(parseLumaRef('  evt-ynMgsbJOURWEDEQ '), 'evt-ynMgsbJOURWEDEQ')
  assert.equal(parseLumaRef('y9koun3u'), 'y9koun3u')
})

test('parseLumaRef rejects other hosts and junk', () => {
  for (const bad of ['https://evil.io/y9koun3u', 'https://luma.com/', 'not a slug!', '', 'https://luma.com.evil.io/x']) {
    assert.equal(parseLumaRef(bad), null, bad)
  }
})

test('mapLumaEvent maps the public payload', () => {
  const e = mapLumaEvent(fixture)!
  assert.equal(e.lumaEventId, 'evt-ynMgsbJOURWEDEQ')
  assert.equal(e.lumaUrl, 'https://luma.com/y9koun3u')
  assert.equal(e.timezone, 'Asia/Kolkata')
  assert.equal(e.startAt.toISOString(), '2026-10-08T05:30:00.000Z')
  assert.equal(e.endAt?.toISOString(), '2026-10-08T08:30:00.000Z')
  assert.equal(e.coverUrl, 'https://images.lumacdn.com/uploads/tj/2b1e2f7c-5c9d-4df4-b17a-414ab03dfa8f.jpg')
  assert.deepEqual([e.city, e.country, e.isOnline], ['Nashik', 'IN', false])
  assert.ok(e.descriptionMd?.startsWith('# **Team1 Builders Connect'))
  assert.equal(e.lumaVisibility, 'public')
})

test('mapLumaEvent returns null for non-events and broken payloads', () => {
  assert.equal(mapLumaEvent({ kind: 'calendar', data: {} }), null)
  assert.equal(mapLumaEvent({ kind: 'event', data: { event: { api_id: 'evt-x' } } }), null) // no name/start
  assert.equal(mapLumaEvent(null), null)
})

test('online events have no location', () => {
  const online = structuredClone(fixture)
  online.data.event.location_type = 'online'
  delete online.data.event.geo_address_info
  const e = mapLumaEvent(online)!
  assert.deepEqual([e.isOnline, e.city, e.country], [true, null, null])
})

test('evt- ids use event/get, slugs use the url resolver', async () => {
  const { lumaRequest } = await import('@/app/(site)/events/_lib/luma')
  assert.deepEqual(lumaRequest('evt-ynMgsbJOURWEDEQ'), { url: 'https://api.lu.ma/event/get?event_api_id=evt-ynMgsbJOURWEDEQ', wrapped: false })
  assert.deepEqual(lumaRequest('y9koun3u'), { url: 'https://api.lu.ma/url?url=y9koun3u', wrapped: true })
})
