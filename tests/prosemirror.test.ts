import { test } from 'vitest'
import assert from 'node:assert/strict'
import { proseMirrorToMarkdown } from '@/app/(site)/events/_lib/prosemirror'

const t = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const doc = (...content: unknown[]) => ({ type: 'doc', content })

test('headings, paragraphs and inline marks', () => {
  const md = proseMirrorToMarkdown(
    doc(
      { type: 'heading', attrs: { level: 2 }, content: [t('Intro', [{ type: 'bold' }])] },
      { type: 'paragraph', content: [t('Hello '), t('world', [{ type: 'italic' }]), t(' and '), t('code', [{ type: 'code' }])] },
    ),
  )
  assert.equal(md, '## **Intro**\n\nHello *world* and `code`')
})

test('links, hard breaks and rules', () => {
  const md = proseMirrorToMarkdown(
    doc(
      { type: 'paragraph', content: [t('Docs', [{ type: 'link', attrs: { href: 'https://build.avax.network' } }]), { type: 'hard_break' }, t('next')] },
      { type: 'horizontal_rule' },
    ),
  )
  assert.equal(md, '[Docs](https://build.avax.network)  \nnext\n\n---')
})

test('bullet and ordered lists', () => {
  const li = (s: string) => ({ type: 'list_item', content: [{ type: 'paragraph', content: [t(s)] }] })
  const md = proseMirrorToMarkdown(doc({ type: 'bullet_list', content: [li('a'), li('b')] }, { type: 'ordered_list', content: [li('one'), li('two')] }))
  assert.equal(md, '- a\n- b\n\n1. one\n2. two')
})

test('strips zero-width chars, ignores non-http links and unknown nodes keep their text', () => {
  const md = proseMirrorToMarkdown(
    doc(
      { type: 'paragraph', content: [t('​​Hi')] },
      { type: 'paragraph', content: [t('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])] },
      { type: 'mystery', content: [t('kept')] },
    ),
  )
  assert.equal(md, 'Hi\n\nx\n\nkept')
})

test('garbage input yields an empty string', () => {
  assert.equal(proseMirrorToMarkdown(null), '')
  assert.equal(proseMirrorToMarkdown({ type: 'doc' }), '')
  assert.equal(proseMirrorToMarkdown('nope'), '')
})

test('whitespace inside marks moves outside so Markdown still renders it', () => {
  const md = proseMirrorToMarkdown(doc({ type: 'paragraph', content: [t('from '), t('Nashik ', [{ type: 'bold' }]), t('for'), t(' x', [{ type: 'italic' }])] }))
  assert.equal(md, 'from **Nashik** for *x*')
})
