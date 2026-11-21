import { formatUtc } from '@/lib/dates'

export function RevisionEvidence({ revision }: { revision: {
  number: number; notes: string; links: string[]; pullRequests: string[]; changeNote: string | null
  termsVersion: number; acceptedAt: Date; withdrawnAt: Date | null; withdrawalReason: string | null
} }) {
  return (
    <>
      <p className="text-sm text-fg-muted">Terms version {revision.termsVersion} accepted {formatUtc(revision.acceptedAt)}</p>
      {revision.notes && <p className="mt-2 whitespace-pre-wrap break-words">{revision.notes}</p>}
      {(revision.links.length > 0 || revision.pullRequests.length > 0) && <ul className="mt-2">
        {[...new Set([...revision.links, ...revision.pullRequests])].map((url) => (
          <li key={url}><a className="inline-flex min-h-11 items-center break-all underline underline-offset-4" href={url} target="_blank" rel="noopener noreferrer">{url}<span className="sr-only"> (opens in a new tab)</span></a></li>
        ))}
      </ul>}
      {revision.changeNote && <p className="mt-2 whitespace-pre-wrap break-words">Changes · {revision.changeNote}</p>}
      {revision.withdrawnAt && <p className="mt-2 whitespace-pre-wrap break-words">Withdrawn {formatUtc(revision.withdrawnAt)} · {revision.withdrawalReason}</p>}
    </>
  )
}
