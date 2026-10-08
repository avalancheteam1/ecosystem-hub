import { test } from 'vitest'
import assert from 'node:assert/strict'
import { buildQrSvg } from '@/lib/qr'

test('light QR with defaults: 2000px, black on white, team1 badge', () => {
  const svg = buildQrSvg('https://hub.team1.network/?ref=abc')
  assert.match(svg, /width="2000" height="2000"/)
  assert.match(svg, /<rect width="\d+" height="\d+" fill="#fff"\/>/)
  assert.match(svg, /fill="#000"/)
  assert.match(svg, /rx=/)
  assert.match(svg, /#e6212f/)
})

test('dark mode inverts colours', () => {
  assert.match(buildQrSvg('x', { mode: 'dark' }), /<rect width="\d+" height="\d+" fill="#000"\/>/)
})

test('size is respected and the logo can be omitted', () => {
  const svg = buildQrSvg('x', { size: 512, logo: false })
  assert.match(svg, /width="512" height="512"/)
  assert.doesNotMatch(svg, /rx=/)
})

test('transparent omits the background rect but keeps the modules', () => {
  const svg = buildQrSvg('x', { transparent: true })
  assert.doesNotMatch(svg, /<rect width="\d+" height="\d+" fill="#fff"\/>/)
  assert.match(svg, /<path d="M[^"]+" fill="#000"\/>/)
})

test('different values encode to different codes', () => {
  assert.notEqual(buildQrSvg('a'), buildQrSvg('b'))
})
