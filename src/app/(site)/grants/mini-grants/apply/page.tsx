import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { BackLink } from '@/components/back-link'
import { EmptyState } from '@/components/empty-state'
import { myProjects, publishedRounds } from '../../_lib/queries'
import { GrantCommandForm } from '../../_components/command-form'
import { applicationFields, costRepeater } from '../../_components/fields'
export const metadata: Metadata = {
  title: 'New grant application',
  robots: {
    index: false,
  },
}
export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const query = await searchParams
  const initialStep = Math.max(0, ['project', 'outcome', 'milestone', 'review'].indexOf(query.step || 'project'))
  const [projects, rounds] = await Promise.all([myProjects(), publishedRounds()])
  return (
    <div className="container-page py-10">
      <BackLink href="/grants/applications">All applications</BackLink>
      <PageHeader
        title="New application"
        description="Save an incomplete draft, review the full application, then confirm submission. Your existing project supplies the project details and team."
      />
      {!rounds.length ? (
        <EmptyState
          title="No open round"
          action={
            <Link href={'/grants'} className="inline-flex min-h-11 items-center text-brand hover:underline">
              {'View programmes'}
            </Link>
          }
        >
          Applications will open when a grant round is published.
        </EmptyState>
      ) : !projects.length ? (
        <EmptyState
          title="Create your project first"
          action={
            <Link href={'/projects/new'} className="inline-flex min-h-11 items-center text-brand hover:underline">
              {'Create a project'}
            </Link>
          }
        >
          You need to be the owner or a writer on a saved Hub project.
        </EmptyState>
      ) : (
        <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
          <GrantCommandForm
            create
            initialStep={initialStep}
            label="Save application draft"
            fields={[
              {
                path: 'projectId',
                label: 'Your Hub project',
                type: 'select',
                options: projects.map((p) => ({
                  value: p.id,
                  label: p.currentVersion?.name || p.slug,
                })),
              },
              {
                path: 'roundId',
                label: 'Application round',
                type: 'select',
                options: rounds.map((r) => ({
                  value: r.id,
                  label: r.name,
                })),
              },
              ...applicationFields.map((f) => ({
                ...f,
                optional: true,
              })),
            ]}
            repeaters={[costRepeater()]}
            data={{
              projectId: '',
              roundId: rounds[0].id,
              answers: {
                problem: '',
                outcome: '',
                capability: '',
                funding: '',
                maintenance: '',
                risks: '',
                costs: [
                  {
                    title: '',
                    amountMinor: 0,
                  },
                ],
                terms: {
                  title: '',
                  acceptance: '',
                  amountMinor: 0,
                  due: '',
                  maintainer: '',
                  verifier: '',
                  route: 'bounded_pilot',
                  hypothesis: '',
                  limits: '',
                },
              },
            }}
          />
          <aside className="border-t border-line pt-6 text-sm text-fg-muted lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <h2 className="text-lg">Your request</h2>
            <p className="mt-4">One useful standalone output, a measurable acceptance test and remaining costs only.</p>
            <p className="mt-4">
              Saving a draft does not seal your project or submit an application. Submission happens only after explicit confirmation.
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}
