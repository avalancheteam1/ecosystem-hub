// Luma event descriptions come as ProseMirror JSON (`description_mirror`).
// Converts the subset Luma's editor produces to Markdown. Pure; unknown nodes
// degrade to their text, never throw.

type Mark = { type?: string; attrs?: { href?: unknown } }
type Node = { type?: string; text?: string; attrs?: { level?: unknown }; marks?: Mark[]; content?: Node[] }

const ZERO_WIDTH = /[​-‍﻿]/g

function inline(nodes: Node[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'hard_break') return '  \n'
      if (n.type !== 'text') return inline(n.content)
      const raw = (n.text ?? '').replace(ZERO_WIDTH, '')
      // Markdown forbids whitespace just inside ** / * / ` — keep it outside the marks.
      const [, lead, core, trail] = raw.match(/^(\s*)([\s\S]*?)(\s*)$/)!
      let s = core!
      if (!s) return raw
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') s = `**${s}**`
        else if (m.type === 'italic') s = `*${s}*`
        else if (m.type === 'code') s = `\`${s}\``
        else if (m.type === 'link' && typeof m.attrs?.href === 'string' && /^https?:\/\//.test(m.attrs.href)) s = `[${s}](${m.attrs.href})`
      }
      return lead + s + trail
    })
    .join('')
}

function block(n: Node): string {
  switch (n.type) {
    case 'paragraph':
      return inline(n.content)
    case 'heading': {
      const level = Math.min(Math.max(Number(n.attrs?.level) || 1, 1), 6)
      return `${'#'.repeat(level)} ${inline(n.content)}`
    }
    case 'bullet_list':
      return (n.content ?? []).map((li) => `- ${blocks(li.content, '\n')}`).join('\n')
    case 'ordered_list':
      return (n.content ?? []).map((li, i) => `${i + 1}. ${blocks(li.content, '\n')}`).join('\n')
    case 'horizontal_rule':
      return '---'
    case 'text':
      return inline([n])
    default:
      return n.content ? blocks(n.content, '\n\n') : ''
  }
}

function blocks(nodes: Node[] | undefined, sep: string): string {
  return (nodes ?? []).map(block).filter((s) => s.trim() !== '').join(sep)
}

export function proseMirrorToMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  return blocks((doc as Node).content, '\n\n').trim()
}
