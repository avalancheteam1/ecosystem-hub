import { test } from 'vitest'
import assert from 'node:assert/strict'
import { blocksPublish, fetchPortalEvent, mapPortalEvent, PortalAuthError } from '@/app/(site)/events/_lib/portal'

const full = {
  id: 'evt-abc123',
  name: ' team1 Istanbul Meetup ',
  startAt: '2026-11-01T16:00:00.000Z',
  endAt: '2026-11-01T19:00:00.000Z',
  timezone: 'Europe/Istanbul',
  url: 'https://luma.com/ist-meetup',
  coverUrl: 'https://images.lumacdn.com/x.png',
  descriptionMd: '**Hi**',
  status: 'private',
  location: { city: 'Istanbul', country: 'TR', cityState: 'Istanbul, Türkiye', fullAddress: 'Some St 1', lat: 41, lng: 29 },
}

test('mapPortalEvent maps the portal full event to hub fields', () => {
  const e = mapPortalEvent(full)!
  assert.equal(e.lumaEventId, 'evt-abc123')
  assert.equal(e.name, 'team1 Istanbul Meetup')
  assert.equal(e.lumaUrl, 'https://luma.com/ist-meetup')
  assert.equal(e.startAt.toISOString(), '2026-11-01T16:00:00.000Z')
  assert.equal(e.timezone, 'Europe/Istanbul')
  assert.equal(e.country, 'TR')
  assert.equal(e.isOnline, false)
  assert.equal(e.lumaVisibility, 'private')
})

test('mapPortalEvent: no address and no city = online; defaults for missing fields', () => {
  const e = mapPortalEvent({ ...full, url: null, timezone: null, location: { city: null, country: 'Turkey', fullAddress: null } })!
  assert.equal(e.isOnline, true)
  assert.equal(e.country, null)
  assert.equal(e.timezone, 'UTC')
  assert.equal(e.lumaUrl, 'https://luma.com/evt-abc123')
})

test('mapPortalEvent rejects unusable payloads', () => {
  assert.equal(mapPortalEvent(null), null)
  assert.equal(mapPortalEvent({ ...full, id: 'abc' }), null)
  assert.equal(mapPortalEvent({ ...full, name: '' }), null)
  assert.equal(mapPortalEvent({ ...full, startAt: 'nope' }), null)
})

test('blocksPublish: only non-public portal events', () => {
  assert.equal(blocksPublish({ source: 'portal', lumaVisibility: 'public' }), false)
  assert.equal(blocksPublish({ source: 'portal', lumaVisibility: 'private' }), true)
  assert.equal(blocksPublish({ source: 'portal', lumaVisibility: 'hidden' }), true)
  assert.equal(blocksPublish({ source: 'luma', lumaVisibility: 'private' }), false)
})

test('fetchPortalEvent: a missing or refused key is a PortalAuthError (aborts the import job)', async () => {
  const key = process.env.MEMBER_PORTAL_API_KEY
  const realFetch = globalThis.fetch
  try {
    delete process.env.MEMBER_PORTAL_API_KEY
    await assert.rejects(fetchPortalEvent('evt-x'), PortalAuthError)
    process.env.MEMBER_PORTAL_API_KEY = 'wrong'
    globalThis.fetch = async () => new Response(null, { status: 401 })
    await assert.rejects(fetchPortalEvent('evt-x'), PortalAuthError)
    globalThis.fetch = async () => new Response(null, { status: 404 })
    await assert.rejects(fetchPortalEvent('evt-x'), (err) => !(err instanceof PortalAuthError))
  } finally {
    globalThis.fetch = realFetch
    if (key === undefined) delete process.env.MEMBER_PORTAL_API_KEY
    else process.env.MEMBER_PORTAL_API_KEY = key
  }
})
