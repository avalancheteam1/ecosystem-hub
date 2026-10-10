import type { Metadata } from 'next'
import { Info } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/guards'
import { JOBS } from '@/lib/jobs'
import { RefreshButton, RunNowButton } from './_components/run-now-button'

export const metadata: Metadata = { title: 'Jobs' }

const STATUS_CLASS: Record<string, string> = {
  success: 'bg-success/15 text-success',
  partial: 'bg-warning/15 text-warning',
  failed: 'bg-destructive/15 text-destructive',
  running: 'bg-info/15 text-info',
}

function Status({ status }: { status: string }) {
  return <Badge className={`rounded-full border-0 ${STATUS_CLASS[status] ?? ''}`}>{status}</Badge>
}

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : '-')

export default async function JobsPage() {
  await requireSuperAdmin()
  const runs = await prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 })
  const last = new Map<string, (typeof runs)[number]>()
  for (const r of runs) if (!last.has(r.job)) last.set(r.job, r)

  return (
    <>
      <PageHeader title="Jobs" description="Scheduled background jobs, run by the worker service. Times in UTC.">
        <RefreshButton />
      </PageHeader>
      <div className="mb-12 overflow-x-auto rounded-xl border border-line bg-surface-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {JOBS.map((job) => {
              const r = last.get(job.name)
              return (
                <TableRow key={job.name}>
                  <TableCell className="text-fg-heading">
                    <span className="flex items-center gap-1.5">
                      {job.name}
                      <span title={job.description} aria-label={job.description} role="img" className="cursor-help text-fg-faint hover:text-fg-muted">
                        <Info className="size-3.5" aria-hidden />
                      </span>
                    </span>
                  </TableCell>
                  <TableCell><code>{job.cron}</code></TableCell>
                  <TableCell>{r ? <span className="flex items-center gap-2"><Status status={r.status} /> {fmt(r.startedAt)}</span> : <span className="text-fg-faint">never</span>}</TableCell>
                  <TableCell className="text-right"><RunNowButton name={job.name} /></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <h2 className="mb-3 text-lg">Recent runs</h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Finished</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id} className="align-top">
                <TableCell>{r.job}</TableCell>
                <TableCell><Status status={r.status} /></TableCell>
                <TableCell className="whitespace-nowrap">{fmt(r.startedAt)}</TableCell>
                <TableCell className="whitespace-nowrap">{fmt(r.finishedAt)}</TableCell>
                <TableCell>
                  {r.summary != null && (
                    <details>
                      <summary className="text-sm text-fg-muted">Show</summary>
                      <pre className="mt-2 max-w-md overflow-x-auto text-xs">{JSON.stringify(r.summary, null, 2)}</pre>
                    </details>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {runs.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-fg-muted">No runs yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
