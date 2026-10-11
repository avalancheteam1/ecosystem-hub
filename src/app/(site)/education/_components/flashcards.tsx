'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import type { Flashcard } from '../_lib/rules'

export function Flashcards({ cards }: { cards: Flashcard[] }) {
  const [i, setI] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const card = cards[i]
  const go = (to: number) => { setI(to); setRevealed(false) }

  return (
    <div className="my-8 max-w-[72ch]">
      <div className="flex min-h-56 flex-col justify-center rounded-xl border border-line bg-surface-1 p-6 transition-colors hover:border-brand sm:p-8">
        {/* The answer sits outside the button: example text can hold links. */}
        <button type="button" onClick={() => setRevealed((r) => !r)} aria-expanded={revealed} className="flex flex-col text-left">
          <span className="meta">{i + 1} / {cards.length} · {revealed ? 'tap to hide' : 'tap to reveal'}</span>
          <span className="mt-3 text-2xl text-fg-heading">{card.term}</span>
        </button>
        {revealed && (
          <div className="mt-4 space-y-3">
            <p className="text-fg-body">{card.definition}</p>
            {card.example && <Markdown className="text-sm text-fg-muted">{card.example}</Markdown>}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Button type="button" variant="outline" size="icon" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous card"><ChevronLeft /></Button>
        <Button type="button" variant="outline" size="icon" onClick={() => go(i + 1)} disabled={i === cards.length - 1} aria-label="Next card"><ChevronRight /></Button>
      </div>
    </div>
  )
}
