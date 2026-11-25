import type { Metadata } from 'next'
import { isFlagOn } from '@/lib/flag-store'
import { canonical } from '@/lib/metadata'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'How grants work',
  description: 'From application and evidence review to milestone delivery and outcome monitoring.',
  ...canonical('/grants/how-it-works'),
}
export default async function HowGrantsWork() {
  const continuous = await isFlagOn('miniGrantsIntake')
  return (
    <>
      <ol className="max-w-3xl space-y-8">
        {[
          ['Choose your project', 'Reuse the project and team you already have in the Hub.'],
          continuous
            ? ['Show what works and what comes next', 'Add a working demo link to your Hub project. Choose a roadmap milestone or propose a deliverable with a date and evidence of completion.']
            : ['Choose a roadmap milestone', 'Select a planned or in-progress milestone from your Hub project. Describe the acceptance test, remaining costs and funding overlap.'],
          [
            'Share evidence',
            'Reviewers assess supported evidence and ask for clarification where needed. A score alone does not approve funding.',
          ],
          [
            'Agree and deliver',
            'An authorised decision creates terms. Confirm them before submitting delivery evidence; amendments need renewed review and confirmation.',
          ],
          [
            'Track payment and outcomes',
            'Payment records track the authorised external finance process. Report project-specific impact at 30, 90 and 180 days after accepted delivery. These checkpoints are a proposed module default.',
          ],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-sm">{i + 1}</span>
            <div>
              <h2 className="text-lg">{title}</h2>
              <p className="mt-2 text-fg-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link className={buttonVariants({ className: 'mt-10' })} href="/grants/mini-grants">
        Prepare your application
      </Link>
    </>
  )
}
