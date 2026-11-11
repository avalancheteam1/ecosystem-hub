import { test } from 'vitest'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

const hit = (path: string, ip: string) => proxy(new NextRequest(`https://hub${path}`, { method: 'POST', headers: { 'cf-connecting-ip': ip } })).status

test('the GlitchTip tunnel caps one IP at 60/min without touching the global cap', () => {
  for (let i = 0; i < 60; i++) assert.equal(hit('/monitoring', '198.51.100.1'), 200)
  assert.equal(hit('/monitoring', '198.51.100.1'), 429)
  assert.equal(hit('/sentry-tunnel', '198.51.100.1'), 429)
  assert.equal(hit('/monitoring', '198.51.100.2'), 200)
})

test('the GlitchTip tunnel has one global cap (600/min), shared by both paths', () => {
  // 61 hits so far (the per-IP 429s above never reached the global bucket).
  for (let i = 0; i < 539; i++) assert.equal(hit(i % 2 ? '/monitoring' : '/sentry-tunnel', `203.0.113.${i % 250}`), 200)
  assert.equal(hit('/monitoring', '192.0.2.1'), 429)
  assert.equal(hit('/sentry-tunnel', '192.0.2.2'), 429)
  assert.equal(hit('/Monitoring', '192.0.2.3'), 429) // rewrites ignore case, so must the cap
  assert.equal(hit('/MONITORING', '192.0.2.4'), 429)
})
