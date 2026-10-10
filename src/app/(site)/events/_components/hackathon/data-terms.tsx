'use client'

import { acceptHackathonTerms } from '@/app/(site)/events/_lib/hackathons/terms-actions'
import { CircleCheck, ShieldCheck } from 'lucide-react'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'

// Shown once per hackathon before an organiser opens the console or a judge their queue.
// Organisers receive registrant data as independent controllers; judges only see submissions.
const TERMS = {
  organizer: {
    intro: 'As an organiser you see the name, email and answers of everyone who registers, and the teams and projects they submit. Before you continue, please confirm:',
    points: [
      'I use this data only to run this hackathon - including follow-ups about it, such as prizes and results.',
      'I don’t use it for marketing and don’t pass it on to anyone else, sponsors included.',
      'I keep it confidential and delete any copies (e.g. CSV exports) once they are no longer needed for this hackathon.',
      'I am responsible for complying with the data protection laws that apply to me.',
    ],
  },
  judge: {
    intro: 'As a judge you see the projects submitted to this hackathon. Before you continue, please confirm:',
    points: [
      'I keep submissions confidential and use them only to judge this hackathon.',
      'I don’t copy or share them, and delete any notes with project details once judging is done.',
    ],
  },
} as const

export function DataTerms({ hackathonId, role }: { hackathonId: string; role: 'organizer' | 'judge' }) {
  const { pending, run } = useActionToast()
  const t = TERMS[role]
  return (
    <SectionCard>
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-6 shrink-0 text-brand" aria-hidden />
        <p className="text-fg-body">{t.intro}</p>
      </div>
      <ul className="mt-6 grid gap-3">
        {t.points.map((p) => (
          <li key={p} className="flex items-start gap-3 rounded-lg border border-line bg-surface-1 p-4 text-fg-body">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <p className="text-sm text-fg-muted">
          Builders are told who sees their data in our{' '}
          <a href="https://go.team1.network/privacy-policy" target="_blank" rel="noreferrer" className="underline decoration-brand underline-offset-2">privacy policy</a>.
        </p>
        <Button size="lg" disabled={pending} onClick={() => run(() => acceptHackathonTerms({ hackathonId, role }), 'Thanks - you’re all set')}>I agree</Button>
      </div>
    </SectionCard>
  )
}
