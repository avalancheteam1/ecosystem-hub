import { hasDemoProof, type PlanIntake } from '../_lib/schemas'

type Project = { name: string; number: number; demoLinks: string[] }

export function ProjectDemoLinks({ links }: { links: string[] }) {
  const demos = [...new Set(links.filter((url) => hasDemoProof([url])))]
  if (!demos.length) return <p className="text-sm text-fg-muted">No demo link added.</p>
  return (
    <ul>
      {demos.map((url) => (
        <li key={url}>
          <a href={url} target="_blank" rel="noreferrer nofollow" className="inline-flex min-h-11 max-w-full items-center wrap-anywhere text-sm underline underline-offset-4">
            {url}<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export function GrantPlanSummary({ answers, project }: { answers: PlanIntake; project: Project }) {
  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-fg-muted">Hub project</dt>
          <dd className="wrap-anywhere">{project.name} · Version {project.number}</dd>
        </div>
        <div>
          <dt className="text-sm text-fg-muted">Requested amount</dt>
          <dd>{answers.amountMinor === null ? 'Not set' : `$${(answers.amountMinor / 100).toLocaleString('en-US')} USD`}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-fg-muted">Working demo</dt>
          <dd><ProjectDemoLinks links={project.demoLinks} /></dd>
        </div>
        {answers.summary && <div className="sm:col-span-2">
          <dt className="text-sm text-fg-muted">Work this grant will fund</dt>
          <dd className="wrap-anywhere whitespace-pre-wrap">{answers.summary}</dd>
        </div>}
      </dl>
      <div className="space-y-3">
        <h3 className="text-base">Milestone plan</h3>
        {answers.milestones.length === 0 ? <p className="text-sm text-fg-muted">No milestones saved yet.</p> : (
          <ol className="divide-y divide-line rounded-lg border border-line">
            {answers.milestones.map(({ title, due, evidence }, index) => (
              <li key={index} className="min-w-0 space-y-2 p-3.5 sm:p-4">
                <h4 className="wrap-anywhere">{index + 1}. {title || 'Untitled milestone'}</h4>
                <p className="text-sm text-fg-muted">{due ? <>Target date <time dateTime={due}>{due}</time> (UTC)</> : 'Target date not set.'}</p>
                <dl>
                  <dt className="text-sm text-fg-muted">Evidence of completion</dt>
                  <dd className="wrap-anywhere whitespace-pre-wrap">{evidence || 'Not set'}</dd>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}
