import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { getManagedHackathon, listRegistrations, REGISTRATION_SORTS } from '@/app/(site)/events/_lib/hackathons/queries'
import type { Answers } from '@/components/answer-fields'
import { DataTable } from '@/components/data-table'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/guards'
import { pageParam, sortParams, textParam } from '@/lib/params'
import { cn } from '@/lib/utils'
import { FieldList } from '../_components/field-editor'
import { ApprovalSettings, BulkApprove, RegistrationDetails, ReviewButtons, SelectRow } from '../_components/registration-controls'

export const metadata = { title: 'Registration' }

const PAGE_SIZE = 50
const STATUSES = [
  { key: 'pending', label: 'To review', hint: 'Approved builders get an email.' },
  { key: 'active', label: 'Registered', hint: 'Builders who are in. Use their details only to run this hackathon.' },
  { key: 'rejected', label: 'Rejected', hint: "Rejected builders can't re-register, but you can still approve them here." },
  { key: 'withdrawn', label: 'Withdrawn', hint: 'Builders who left the hackathon.' },
] as const

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'

function answerText(v: unknown) {
  if (v == null) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

export default async function RegistrationPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string | string[]; status?: string | string[]; q?: string | string[]; page?: string | string[]; sort?: string | string[]; dir?: string | string[] }>
}) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const sp = await searchParams
  // Settings get their own tab so a long question list never pushes the registrations down.
  const settings = sp.view === 'settings'
  const status = STATUSES.find((s) => s.key === sp.status) ?? STATUSES[h.requireApproval ? 0 : 1]
  const q = textParam(sp.q)
  const page = pageParam(sp.page)
  const sort = sortParams(sp, REGISTRATION_SORTS, { key: 'createdAt', dir: 'asc' })
  const { rows, hasMore, counts } = await listRegistrations(h.id, { status: status.key, q, sort, page, pageSize: PAGE_SIZE })
  // Empty tabs only clutter - except "To review" while approval is on, and "Registered".
  const tabs = STATUSES.filter((s) => s.key === status.key || s.key === 'active' || counts[s.key] || (s.key === 'pending' && h.requireApproval))
  const reviewable = !settings && status.key === 'pending' || status.key === 'rejected'
  const inviteUrl = h.inviteToken ? `${siteUrl()}/events/${h.event.slug}/join?invite=${h.inviteToken}` : null


  const table = (
    <DataTable
      id={`hackathon-registrations-${h.id}`}
      sort={sort}
      empty={q ? 'No one found.' : 'No one here.'}
      columns={[
        ...(reviewable ? [{ key: 'select', label: '', hideable: false }] : []),
        { key: 'name', label: 'Name', sortable: true, hideable: false },
        { key: 'email', label: 'Email', sortable: true },
        { key: 'createdAt', label: 'Registered', sortable: true, className: 'whitespace-nowrap' },
        ...h.fields.map((f) => ({ key: f.id, label: f.label })),
        { key: 'actions', label: '', hideable: false },
      ]}
      rows={rows.map((r) => {
        const answers = r.answers as Answers
        return {
          id: r.id,
          cells: {
            select: <SelectRow id={r.id} label={r.user.name} />,
            name: <span className="text-fg-heading">{r.user.name}</span>,
            email: r.user.email,
            // admin tables print UTC
            createdAt: r.createdAt.toISOString().slice(0, 16).replace('T', ' '),
            ...Object.fromEntries(h.fields.map((f) => {
              const text = answerText(answers[f.id])
              return [f.id, <span key={f.id} className="block max-w-xs truncate" title={text}>{text}</span>]
            })),
            actions: (
              <div className="flex justify-end gap-2">
                {h.fields.length > 0 && <RegistrationDetails name={r.user.name} email={r.user.email} fields={h.fields} answers={answers} />}
                {reviewable && <ReviewButtons hackathonId={h.id} participantId={r.id} status={r.status} />}
              </div>
            ),
          },
        }
      })}
    />
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Same look as SegmentedControl, but links - the status lives in the URL. */}
        <nav aria-label="Registrations by status" className="no-scrollbar flex max-w-full overflow-x-auto rounded-lg border border-input p-1">
          {tabs.map((s) => {
            const active = !settings && s.key === status.key
            return (
              <Link
                key={s.key}
                href={`?status=${s.key}`}
                scroll={false}
                aria-current={active ? 'page' : undefined}
                className={cn('inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors', active ? 'bg-surface-hover text-fg-heading shadow-xs' : 'text-fg-muted hover:text-fg-heading')}
              >
                {s.label}
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-brand text-white' : 'bg-surface-1 text-fg-faint')}>{counts[s.key] ?? 0}</span>
              </Link>
            )
          })}
        </nav>
        <Button asChild variant={settings ? 'secondary' : 'outline'}>
          <Link href="?view=settings" scroll={false} aria-current={settings ? 'page' : undefined}>
            <Settings2 aria-hidden /> Approval & questions ({h.fields.length})
          </Link>
        </Button>
      </div>

      {settings ? (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <SectionCard title="Approval" description="Decide who gets in.">
            <ApprovalSettings hackathonId={h.id} requireApproval={h.requireApproval} inviteUrl={inviteUrl} />
          </SectionCard>
          <SectionCard title="Registration questions" description="Asked when a builder registers. Their name and email come from their account - don't ask again.">
            <FieldList hackathonId={h.id} stageId={null} fields={h.fields} emptyText="No questions - registering is one click." />
          </SectionCard>
        </div>
      ) : (
        <section className="min-w-0">
          <p className="mb-4 text-sm text-fg-muted">{status.hint}</p>
          <SearchForm q={q} placeholder="Search name or email" keep={{ status: status.key }} />
          {reviewable ? <BulkApprove hackathonId={h.id} ids={rows.map((r) => r.id)}>{table}</BulkApprove> : table}
          <Pager page={page} hasMore={hasMore} params={{ status: status.key, q, sort: sort.key, dir: sort.dir }} />
        </section>
      )}
    </div>
  )
}
