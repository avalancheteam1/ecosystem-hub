'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isCorrect, optionOrder, quizVariant, type Quiz as QuizData } from '../_lib/rules'

// ponytail: no saved progress or attempt limits - add a QuizAttempt table when course completion becomes a signal.
export function Quiz({ id, quiz }: { id: string; quiz: QuizData }) {
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [checked, setChecked] = useState(false)
  const q = quizVariant(quiz, attempt)
  const multi = q.correctAnswers.length > 1
  const correct = checked && isCorrect(selected, q.correctAnswers)

  function toggle(i: number) {
    setSelected((s) => (multi ? (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]) : [i]))
  }
  function retry() {
    setAttempt((a) => a + 1)
    setSelected([])
    setChecked(false)
  }

  return (
    <fieldset className="my-8 max-w-[72ch] rounded-xl border border-line bg-surface-1 p-5 sm:p-6">
      <legend className="sr-only">Quiz question</legend>
      <p className="meta">Quiz · {multi ? 'select all correct answers' : 'select one answer'}</p>
      <p className="mt-2 text-lg text-fg-heading">{q.question}</p>
      <div className="mt-4 space-y-2">
        {optionOrder(q.options.length, `${id}:${attempt}`).map((i) => {
          const picked = selected.includes(i)
          const right = q.correctAnswers.includes(i)
          return (
            <label
              key={`${attempt}-${i}`}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors',
                !checked && (picked ? 'border-brand bg-brand/5 text-fg-heading' : 'border-line hover:border-fg-faint'),
                checked && picked && right && 'border-success bg-success/10 text-fg-heading',
                checked && picked && !right && 'border-destructive bg-destructive/10',
                checked && !picked && 'border-line opacity-70',
                checked && 'cursor-default',
              )}
            >
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={`quiz-${id}`}
                checked={picked}
                disabled={checked}
                onChange={() => toggle(i)}
                className="mt-0.5 size-4 shrink-0 accent-brand"
              />
              <span>{q.options[i]}</span>
            </label>
          )
        })}
      </div>
      {checked && (
        <div role="status" className={cn('mt-4 rounded-lg p-4 text-sm', correct ? 'bg-success/10' : 'bg-warning/10')}>
          <p className={cn('flex items-center gap-2 font-medium', correct ? 'text-success' : 'text-warning')}>
            {correct ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
            {correct ? 'Correct' : 'Not quite'}
          </p>
          <p className="mt-1 text-fg-body">{correct ? q.explanation : <><span className="text-fg-heading">Hint:</span> {q.hint}</>}</p>
        </div>
      )}
      <div className="mt-4">
        {!checked ? (
          <Button type="button" onClick={() => setChecked(true)} disabled={selected.length === 0}>Check answer</Button>
        ) : (
          !correct && <Button type="button" variant="outline" onClick={retry}>Try another question</Button>
        )}
      </div>
    </fieldset>
  )
}
