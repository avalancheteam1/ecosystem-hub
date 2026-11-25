import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { missingForSubmission } from '@/lib/project-submission'
import { SectionCard } from '@/components/section-card'
import { BackLink } from '@/components/back-link'
import { EmptyState } from '@/components/empty-state'
import { myProjects, publishedRounds } from '../../_lib/queries'
import { shortIntakeEnabled } from '../../_lib/config'
import { GrantCommandForm } from '../../_components/command-form'
import { applicationFields, costRepeater } from '../../_components/fields'
import { ShortGrantForm } from '../../_components/short-grant-form'
import { BuilderHubGrantsLink, RoundIntakeStatus } from '../../_components/navigation'
export const metadata: Metadata = {
  title: 'New grant application',
  robots: {
    index: false,
  },
}
export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ step?: string; project?: string }> }) {
  const query = await searchParams
  const shortEnabled = shortIntakeEnabled()
  const initialStep = Math.max(0, ['project', 'outcome', 'milestone', 'review'].indexOf(query.step || 'project'))
  const [projects, rounds] = await Promise.all([myProjects(), publishedRounds()])
  const projectOptions = projects.flatMap(({ id, slug, currentVersion: v, _count }) => v ? [{
    id, slug, name: v.name, tagline: v.shortDescription, imageUrl: v.logoUrl ?? v.coverUrl, maturity: v.maturity,
    versionNumber: v.number, sealed: !!v.sealedAt, members: _count.members, missing: missingForSubmission(v),
  }] : [])
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
          Check the programmes page when a round reopens. <BuilderHubGrantsLink />
        </EmptyState>
      ) : !projectOptions.length ? (
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
          {shortEnabled ? (
            <ShortGrantForm
              projects={projectOptions}
              initialProject={projectOptions.find((project) => project.id === query.project)?.id}
              roadmaps={projects.map(({ id, slug, milestones }) => ({ id, slug, milestones }))}
              rounds={rounds}
            />
          ) : (
            <GrantCommandForm
              create
              initialStep={initialStep}
              projectOptions={projectOptions}
              roadmaps={projects.map(({ id, slug, milestones }) => ({ id, slug, milestones }))}
              label="Save application draft"
              fields={[
                {
                  path: 'projectId',
                  label: 'Your Hub project',
                  type: 'select',
                  options: projectOptions.map((p) => ({
                    value: p.id,
                    label: p.name,
                  })),
                },
                {
                  path: 'roundId',
                  label: 'Open application round',
                  hint: 'This list only includes rounds currently accepting applications.',
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
                projectId: projectOptions.find((project) => project.id === query.project)?.id ?? '',
                roundId: rounds[0].id,
                answers: {
                  problem: '',
                  outcome: '',
                  whyGrant: '',
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
          )}
          <SectionCard title="Before you apply" className="self-start">
            {!shortEnabled && <RoundIntakeStatus open />}
            <p className="mt-4 text-sm text-fg-muted">{shortEnabled
              ? 'Choose a planned or in-progress roadmap milestone, or add a dated deliverable for this application. Describe the evidence you will provide on completion.'
              : 'Choose a planned or in-progress milestone on your project roadmap. Define a measurable acceptance test and list the costs for the remaining work.'}</p>
            <p className="mt-4 text-sm text-fg-muted">Keep project links on your Hub project and contact details in <Link href="/profile" className="underline">your profile</Link>.</p>
            <p className="mt-4 text-sm text-fg-muted">
              Saving a draft does not seal your project or submit an application. Submission happens only after explicit confirmation.
            </p>
          </SectionCard>
        </div>
      )}
    </div>
  )
}
