'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { joinHackathon } from '@/app/(site)/events/_lib/hackathons/participant-actions'
import { AnswerFields, type AnswerField, type Answers } from '@/components/answer-fields'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useActionToast } from '@/hooks/use-action-toast'

export function JoinForm({ hackathonId, fields, termsUrl, invite, needsApproval }: { hackathonId: string; fields: AnswerField[]; termsUrl: string | null; invite?: string; needsApproval: boolean }) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Answers>({})
  const [terms, setTerms] = useState(false)
  const { pending, run } = useActionToast()
  return (
    <form
      className="grid gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        run(async () => {
          const res = await joinHackathon({ hackathonId, answers, acceptTerms: terms, invite })
          if (res.ok) router.push(`/events/${res.data.slug}`)
          return res
        }, needsApproval ? 'Registration received - waiting for approval' : "You're in")
      }}
    >
      {fields.length > 0 && <AnswerFields fields={fields} value={answers} onChange={setAnswers} />}
      {termsUrl && (
        <label className="flex items-start gap-3 text-sm">
          <Checkbox className="mt-0.5" checked={terms} onCheckedChange={(c) => setTerms(c === true)} />
          <span>I accept the <a href={termsUrl} target="_blank" rel="noreferrer" className="underline decoration-brand underline-offset-2">terms of this hackathon</a>.</span>
        </label>
      )}
      <p className="text-sm text-fg-muted">
        The organisers of this hackathon will see your name, email and answers, and judges the projects you submit. Organisers are responsible for their own use of it - see our{' '}
        <a href="https://go.team1.network/privacy-policy" target="_blank" rel="noreferrer" className="underline decoration-brand underline-offset-2">privacy policy</a>.
      </p>
      <div><Button type="submit" size="lg" disabled={pending || (!!termsUrl && !terms)}>Register for Hackathon</Button></div>
    </form>
  )
}
