import { test } from 'vitest'
import assert from 'node:assert/strict'
import { linkListSchema, readLinks } from '@/lib/link-schemas'
import { parseLinks } from '@/lib/links'

test('markdown links, list markers and numbering are ignored', () => {
  const text = ['- [Docs](https://docs.example.com)', '* [Faucet](https://faucet.example.com "Testnet AVAX")', '1. [Starter kit](<https://github.com/x/kit>)', '2) - [ ] [**Discord**](https://discord.gg/abc)'].join('\n')
  assert.deepEqual(parseLinks(text), [
    { label: 'Docs', url: 'https://docs.example.com' },
    { label: 'Faucet', url: 'https://faucet.example.com' },
    { label: 'Starter kit', url: 'https://github.com/x/kit' },
    { label: 'Discord', url: 'https://discord.gg/abc' },
  ])
})

test('several markdown links on one line', () => {
  assert.deepEqual(parseLinks('See [A](https://a.io) and [B](https://b.io).'), [{ label: 'A', url: 'https://a.io' }, { label: 'B', url: 'https://b.io' }])
})

test('bare urls: text before becomes the name, else the host; trailing punctuation dropped', () => {
  assert.deepEqual(parseLinks('Docs: https://docs.example.com/start\n\n- https://www.github.com/ava-labs.\nGuide – <https://guide.io/x>\nno link here'), [
    { label: 'Docs', url: 'https://docs.example.com/start' },
    { label: 'github.com', url: 'https://www.github.com/ava-labs' },
    { label: 'Guide', url: 'https://guide.io/x' },
  ])
})

test('only http(s) links are taken', () => {
  assert.deepEqual(parseLinks('[x](javascript:alert(1))\n[y](ftp://a.io)\nhttps://\n[empty]()'), [])
})

test('stored lists validate; malformed json reads as empty', () => {
  assert.equal(linkListSchema.safeParse([{ label: 'Docs', url: 'javascript:alert(1)' }]).success, false)
  assert.deepEqual(readLinks([{ label: 'Docs', url: 'https://a.io' }]), [{ label: 'Docs', url: 'https://a.io' }])
  assert.deepEqual(readLinks({ nope: true }), [])
})

test('saving drops empty rows and names unnamed links after their host', () => {
  assert.deepEqual(linkListSchema.parse([{ label: '', url: '' }, { label: ' ', url: 'https://www.kit.dev/x' }, { label: 'Docs', url: 'https://a.io' }]), [{ label: 'kit.dev', url: 'https://www.kit.dev/x' }, { label: 'Docs', url: 'https://a.io' }])
  assert.equal(linkListSchema.safeParse([{ label: 'Docs', url: '' }]).success, false) // a name without a link is an error, not silently dropped
})
