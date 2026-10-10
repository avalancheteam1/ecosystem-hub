'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { saveReview } from '@/app/(site)/events/_lib/hackathons/judging-actions'
import { weightedTotal } from '@/app/(site)/events/_lib/hackathons/judging'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'

type Criterion = { id: string; name: string; description: string | null; weight: number }

export function ReviewForm(props: { assignmentId: string; criteria: Criterion[]; scaleMax: number; initialScores: Record<string, number>; initialComment: string; locked: string | null; submitted: boolean; nextHref: string | null; queueHref: string }) {
  const [scores, setScores] = useState<Record<string, number>>(props.initialScores)
  const [comment, setComment] = useState(props.initialComment)
  const { pending, run } = useActionToast()
  const total = useMemo(() => weightedTotal(scores, props.criteria, props.scaleMax), [scores, props.criteria, props.scaleMax])
  const totalWeight = props.criteria.reduce((a, c) => a + c.weight, 0)
  const save = (submit: boolean, conflictDeclared = false) =>
    run(
      () => saveReview({ assignmentId: props.assignmentId, scores, comment, conflictDeclared, submit }),
      conflictDeclared ? 'Conflict declared - the organisers will reassign it' : submit ? 'Review submitted' : 'Draft saved',
    )

  return (
    <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); save(true) }}>
      <fieldset disabled={!!props.locked} className="space-y-6">
        {props.criteria.map((c) => {
          const v = scores[c.id]
          return (
            <div key={c.id}>
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor={`c-${c.id}`} className="text-base">{c.name}</Label>
                <span className="text-xs text-fg-faint">{Math.round((c.weight / totalWeight) * 100)}% of the score</span>
              </div>
              {c.description && <p className="mt-1 text-sm text-fg-muted">{c.description}</p>}
              <div className="mt-3 flex items-center gap-4">
                <input
                  id={`c-${c.id}`}
                  type="range"
                  min={0}
                  max={props.scaleMax}
                  step={props.scaleMax <= 10 ? 0.5 : 1}
                  value={v ?? 0}
                  onChange={(e) => setScores({ ...scores, [c.id]: Number(e.target.value) })}
                  className="h-11 flex-1 accent-[var(--color-brand)]"
                  aria-valuetext={v == null ? 'Not scored' : `${v} of ${props.scaleMax}`}
                />
                <output htmlFor={`c-${c.id}`} className={`w-16 text-right text-lg tabular-nums ${v == null ? 'text-fg-faint' : 'text-fg-heading'}`}>{v ?? '-'}<span className="text-sm text-fg-faint">/{props.scaleMax}</span></output>
              </div>
            </div>
          )
        })}
        <div className="space-y-2">
          <Label htmlFor="comment">Feedback for the organisers</Label>
          <Textarea id="comment" rows={5} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={5000} placeholder="What stood out, what's missing, anything the organisers should know." />
        </div>
      </fieldset>

      <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-3 border-t border-line bg-surface-2/95 px-6 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <p className="mr-auto text-sm text-fg-muted">Score <span className="text-2xl text-fg-heading tabular-nums">{total ?? '-'}</span><span className="text-fg-faint"> / 100</span></p>
        {!props.locked && (
          <>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => confirm('Declare a conflict of interest? Your review won’t count.') && save(false, true)}>Declare conflict</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>Save draft</Button>
            <Button type="submit" disabled={pending || total == null}>{props.submitted ? 'Update review' : 'Submit review'}</Button>
          </>
        )}
        {props.locked && <p className="text-sm text-fg-muted">{props.locked}</p>}
        {props.submitted && (
          <Button asChild className="w-full">
            {props.nextHref
              ? <Link href={props.nextHref}>Next project to review <ArrowRight aria-hidden /></Link>
              : <Link href={props.queueHref}>All done - back to the queue</Link>}
          </Button>
        )}
      </div>
    </form>
  )
}
