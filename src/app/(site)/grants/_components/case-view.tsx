import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { BackLink } from '@/components/back-link'
import { DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { StatusPill } from '@/components/status-pill'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { ProjectVersionView } from '@/components/project-version-view'
import type { readApplication } from '../_lib/queries'
import { activeTerms, addDays, applicationStatus, applicationStatusCopy, readiness, score, statusLabel, totals } from '../_lib/rules'
import { reviewStatus, type Command, type Terms } from '../_lib/schemas'
import { GrantCommandForm, type GrantField, type GrantRepeater } from './command-form'
import { applicationFields, assessmentFields, costRepeater, metricRepeater, options, termsFields } from './fields'
import { shortIntakeEnabled } from '../_lib/config'
import { ShortGrantForm } from './short-grant-form'
import { GrantTabs, RoundIntakeStatus } from './navigation'
import { ApplicantReceipt } from './applicant-receipt'
import { StaffAwardForm } from './staff-award-form'
import { StaffCaseTabs } from './staff-case-tabs'
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n / 100)
const note: GrantField = {
  path: 'note',
  label: 'Note shared with the applicant',
  type: 'textarea',
}
const evidence: GrantField = {
  path: 'evidence',
  label: 'Evidence reference',
}
const recentActivityLabels = new Map([
  ['create', 'Application created'],
  ['save_application', 'Application saved'],
  ['submit_application', 'Application submitted'],
  ['save_assessment', 'Assessment saved'],
  ['release_review_status', 'Review status shared'],
  ['reopen_application', 'Application reopened'],
  ['withdraw_application', 'Application withdrawn'],
  ['request_evidence', 'Evidence requested'],
  ['answer_request', 'Applicant replied'],
  ['clear_milestone', 'Milestone cleared'],
  ['submit_delivery', 'Milestone evidence submitted'],
  ['review_delivery', 'Milestone evidence reviewed'],
  ['record_decision', 'Decision recorded'],
  ['confirm_terms', 'Terms confirmed'],
  ['report_payment', 'Payment reported'],
  ['reconcile_payment', 'Payment status updated'],
  ['submit_amendment', 'Change to award terms proposed'],
  ['review_amendment', 'Proposed change reviewed'],
  ['respond_amendment', 'Response to proposed change recorded'],
  ['save_followup', 'Follow-up saved'],
  ['finish_followup', 'Follow-up status updated'],
  ['draft_reminder', 'Reminder drafted'],
  ['set_impact_plan', 'Impact plan recorded'],
  ['save_impact', 'Impact update saved'],
  ['review_impact', 'Impact update reviewed'],
  ['close_impact', 'Grant closed'],
])
export function GrantCaseView({
  data,
  requestedTab,
  checkpoint = '30',
}: {
  data: Awaited<ReturnType<typeof readApplication>>
  requestedTab?: string
  checkpoint?: string
}) {
  const s = data.state,
    internal = data.staff ? data.state : null,
    capabilities = data.staff ? data.capabilities : null
  const short = s.answers.intakeVersion === 2 ? s.answers : null
  const editShortDraft = !data.staff && data.writer && s.status === 'draft' && short !== null && (data.continuous || shortIntakeEnabled())
  const legacy = s.answers.intakeVersion !== 2 ? s.answers : null
  const requestedAmount = short ? short.amountMinor : legacy?.terms.amountMinor
  const requestedRoute = internal?.answers.intakeVersion === 2 ? undefined : internal?.answers.terms.route
  const base = `${data.staff ? '/admin' : ''}/grants/applications/${data.id}`
  const milestoneFirst = data.staff ? data.state.version === 3 : data.state.milestoneFirst
  const clearedAt = data.staff ? data.state.version === 3 ? data.state.milestoneClearance?.at : null : data.state.clearedAt
  const lastDelivery = s.deliveries.at(-1)
  const canSubmitMilestone = milestoneFirst && !!clearedAt && s.status === 'submitted' && !s.closedAt &&
    (!lastDelivery || lastDelivery.state === 'changes_requested')
  const milestoneStage = !milestoneFirst ? null : s.status === 'approved' ? 'Award issued'
    : s.status !== 'submitted' || !clearedAt ? null
      : lastDelivery?.state === 'accepted' ? 'Milestone verified'
        : lastDelivery?.state === 'submitted' ? 'Evidence under review'
          : lastDelivery?.state === 'changes_requested' ? 'Evidence changes requested' : 'Milestone cleared'
  const applicantTabs = ['Overview', 'Application details', 'History']
  const tabs = data.staff
    ? [
        'Application',
        'Evidence',
        'Evaluation',
        'Requests',
        'Follow-ups',
        'Decision',
        'Amendments',
        'Delivery',
        'Payments',
        'Impact',
        'History',
      ]
    : [...applicantTabs, 'Requests', 'Decision', 'Amendments', 'Delivery', 'Payments', 'Impact']
  const tab = requestedTab ? (tabs.includes(requestedTab) ? requestedTab : tabs[0]) : data.staff ? 'Decision' : tabs[0]
  const oneCase = data.staff && milestoneFirst && !requestedTab
  const caseSectionIds = { Requests: 'case-requests', Delivery: 'case-evidence', Evaluation: 'case-assessment' }
  const staffSectionHref = (section: keyof typeof caseSectionIds) => oneCase ? `#${caseSectionIds[section]}` : `${base}?tab=${section}`
  const applicantOverview = !data.staff && tab === 'Overview'
  const staffMilestoneDecision = data.staff && milestoneFirst && tab === 'Decision'
  const day = ['30', '90', '180'].includes(checkpoint) ? checkpoint : '30'
  const t = s.terms.at(-1),
    active = internal ? activeTerms(internal) : milestoneFirst && s.status === 'approved' ? t : s.terms.findLast((r) => r.confirmedAt)
  const displayedAmount = active?.terms.amountMinor ?? t?.terms.amountMinor ?? requestedAmount
  const amounts = internal
    ? totals(internal)
    : data.staff
      ? {
          approved: 0,
          paid: 0,
          reserved: 0,
          remaining: 0,
        }
      : data.state.totals
  const ownerField: GrantField = { path: 'ownerId', label: 'Action owner', type: 'select', options: data.staff ? data.owners : [] }
  const publicStatus = data.staff ? applicationStatus(data.state) : data.state.applicantStatus
  const statusCopy = applicationStatusCopy[publicStatus.status]
  const maturity = PROJECT_MATURITY[data.projectVersion.maturity as ProjectMaturity]
  const workflowLabel = milestoneStage ?? statusLabel(s, data.staff)
  const workflowTone = s.closedAt
    ? 'success'
    : /await|request|hold/i.test(workflowLabel)
      ? 'warning'
      : s.status === 'draft'
        ? 'neutral'
        : 'info'
  const form = (
    kind: Command['kind'],
    label: string,
    defaults: Record<string, unknown>,
    fields: GrantField[],
    dialog = false,
    repeaters: GrantRepeater[] = [],
    triggerAriaLabel?: string,
  ) => (
    <GrantCommandForm
      key={`${data.id}:${data.revision}:${kind}`}
      applicationId={data.id}
      revision={data.revision}
      label={label}
      data={{
        kind,
        ...defaults,
      }}
      fields={fields}
      dialog={dialog}
      repeaters={repeaters}
      roadmaps={!data.staff && kind === 'save_application' ? [{ id: data.projectId, slug: data.projectSlug, milestones: data.milestones }] : undefined}
      roundOpen={data.roundOpen}
      triggerAriaLabel={triggerAriaLabel}
      recoverUnknownResult={(applicantOverview && (kind === 'answer_request' || kind === 'confirm_terms')) ||
        (!data.staff && milestoneFirst && kind === 'submit_delivery') ||
        (data.staff && milestoneFirst && kind === 'record_decision')}
      secondaryTrigger={kind === 'withdraw_application' || (staffMilestoneDecision && kind === 'record_decision')}
      outcomeSubmitLabels={staffMilestoneDecision && kind === 'record_decision'
        ? { not_selected: 'Record rejection', deferred: 'Defer application' } : undefined}
    />
  )
  const termsView = (value: Pick<Terms, 'title' | 'acceptance' | 'amountMinor' | 'due' | 'maintainer'> & { verifier?: string }) => (
    <dl className="space-y-4">
      <div>
        <dt className="text-sm text-fg-muted">Milestone</dt>
        <dd>{value.title}</dd>
      </div>
      <div>
        <dt className="text-sm text-fg-muted">Acceptance test</dt>
        <dd className="whitespace-pre-wrap">{value.acceptance}</dd>
      </div>
      <div>
        <dt className="text-sm text-fg-muted">Amount / target date</dt>
        <dd>
          {usd(value.amountMinor)} / {value.due || 'Not set'}
        </dd>
      </div>
      <div>
        <dt className="text-sm text-fg-muted">{value.verifier === undefined ? 'Maintainer' : 'Maintainer / verifier'}</dt>
        <dd>
          {value.maintainer || 'To agree'}{value.verifier !== undefined && ` / ${value.verifier || 'To agree'}`}
        </dd>
      </div>
    </dl>
  )
  const shortRequest = short && (
    <SectionCard title="Milestone commitment" className="space-y-3">
      {short.amountMinor !== null && <p><strong>{usd(short.amountMinor)}</strong> requested</p>}
      <p className="wrap-anywhere whitespace-pre-wrap">{short.summary}</p>
      {short.milestone && <dl className="space-y-2">
        <div><dt className="text-sm text-fg-muted">Deliverable and target date</dt><dd className="wrap-anywhere">{short.milestone.title} · {short.milestone.due || 'Not set'}</dd></div>
        <div><dt className="text-sm text-fg-muted">Evidence of completion</dt><dd className="wrap-anywhere whitespace-pre-wrap">{short.milestone.evidence}</dd></div>
      </dl>}
    </SectionCard>
  )
  const applicantEvidenceLabels = milestoneFirst && !data.staff ? {
    release: 'Link to what you built',
    reproduction: 'Link showing how it works',
  } : null
  const deliveryLinks = (delivery: { release: string; reproduction: string }) => (
    <div className="flex flex-wrap gap-x-5">
      <a href={delivery.release} target="_blank" rel="noreferrer nofollow"
        className="inline-flex min-h-11 items-center underline underline-offset-4">{applicantEvidenceLabels?.release ?? 'Release and output'}</a>
      <a href={delivery.reproduction} target="_blank" rel="noreferrer nofollow"
        className="inline-flex min-h-11 items-center underline underline-offset-4">{applicantEvidenceLabels?.reproduction ?? 'Reproduction evidence'}</a>
    </div>
  )
  const milestoneEvidenceForm = (label: string) => form(
    'submit_delivery',
    label,
    { release: '', reproduction: '', note: '' },
    [
      { path: 'release', label: applicantEvidenceLabels?.release ?? 'Release and output URL' },
      { path: 'reproduction', label: applicantEvidenceLabels?.reproduction ?? 'Reproduction evidence URL' },
      milestoneFirst ? { ...note, label: 'Note for the grant team' } : note,
    ],
  )
  const confirmAward = () => form(
    'confirm_terms',
    'Confirm agreed terms',
    { confirm: false },
    [{ path: 'confirm', label: 'I confirm the agreed milestone, amount and acceptance test.', type: 'checkbox' }],
  )
  const requestCard = (request: (typeof s.requests)[number], onOverview = false, allowReply = true) => (
    <section key={request.id} className="space-y-4 border-b border-line pb-6 last:border-b-0 last:pb-0">
      {onOverview ? <h3>{request.title}</h3> : <h2 className="text-lg">{request.title}</h2>}
      <p className="whitespace-pre-wrap">{request.body}</p>
      {request.due && (!onOverview || !request.answeredAt) && <p className="text-sm text-fg-muted">Respond by <time dateTime={request.due}>{request.due}</time> (UTC)</p>}
      {onOverview && <ApplicantReceipt recorded={!!request.answeredAt}>Reply received</ApplicantReceipt>}
      {request.answeredAt ? (
        <p className="wrap-anywhere whitespace-pre-wrap border-l border-line pl-4">{request.reply}</p>
      ) : allowReply && data.writer && s.status === 'submitted' && (!onOverview || !s.closedAt) ? form(
        'answer_request',
        'Respond',
        { requestId: request.id, reply: '' },
        [{ path: 'reply', label: 'Response and supporting references', type: 'textarea' }],
        true,
        [],
        onOverview ? `Respond to ${request.title}` : undefined,
      ) : onOverview && allowReply && <p className="text-sm text-fg-muted">A project editor can respond.</p>}
    </section>
  )
  const legacyDetails = legacy && (
    <>
      {[
        ['Problem and beneficiaries', legacy.problem],
        ['What will this grant fund?', legacy.outcome],
        ...(legacy.whyGrant ? [['Why this grant matters', legacy.whyGrant]] : []),
        ['Execution capability', legacy.capability],
        ['Other funding and cost basis', legacy.funding],
        ['Maintenance and measurement', legacy.maintenance],
        ['Risks and dependencies', legacy.risks],
      ].map(([label, value]) => (
        <div key={label}>
          <h3 className="text-base">{label}</h3>
          <p className="mt-2 whitespace-pre-wrap">{value}</p>
        </div>
      ))}
      {termsView(legacy.terms)}
      <DataTable
        id={`grants:${data.id}:costs`}
        columns={[
          {
            key: 'item',
            label: 'Remaining cost',
            hideable: false,
          },
          {
            key: 'amount',
            label: 'USD',
          },
        ]}
        rows={legacy.costs.map((c, i) => ({
          id: String(i),
          cells: {
            item: c.title,
            amount: usd(c.amountMinor),
          },
        }))}
      />
    </>
  )
  const requestEvidence = () => capabilities?.review && s.status === 'submitted' && form(
    'request_evidence',
    'Request evidence',
    {
      title: '',
      body: '',
    },
    [
      {
        path: 'title',
        label: 'Request title',
      },
      {
        path: 'body',
        label: 'What evidence is needed?',
        hint: clearedAt ? 'Ask for clarification about the cleared milestone. A reply keeps the pinned scope and requires a fresh assessment.' : undefined,
        type: 'textarea',
      },
      { path: 'due', label: 'Respond by (UTC)', type: 'date', optional: true },
    ],
    true,
  )
  let content: React.ReactNode
  let caseAssessment: React.ReactNode
  let caseRequests: React.ReactNode
  let caseDecision: React.ReactNode
  let caseEvidence: React.ReactNode
  if (applicantOverview && s.status !== 'draft') {
    const award = s.status === 'approved' ? active ?? t : undefined
    const pendingAward = !milestoneFirst && award && !award.confirmedAt && !s.closedAt
    const decision = s.decisions.findLast((item) => item.outcome === s.status)
    const statusDetail = s.status === 'deferred'
      ? 'The grant team put the decision on hold.'
      : s.status === 'not_selected' ? 'This application was not selected.' : statusCopy.detail
    const pendingAmendment = s.amendments.findLast((item) => ['submitted', 'changes_requested', 'approved'].includes(item.state))
    const delivery = s.deliveries.at(-1)
    const today = new Date().toISOString().slice(0, 10)
    const acceptedAt = delivery?.state === 'accepted' ? delivery.review?.at : undefined
    const dueCheckpoint = s.impactPlan && acceptedAt && ['30', '90', '180'].find((d) =>
      addDays(acceptedAt.slice(0, 10), Number(d)) <= today &&
      !['submitted', 'reviewed'].includes(s.impact.findLast((item) => item.day === d)?.state ?? ''),
    )
    const canDeliver = !milestoneFirst && !!active && !pendingAmendment && (!delivery || delivery.state === 'changes_requested')
    const actionLink = 'inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4'
    const requests = s.status === 'submitted' ? s.requests : []
    const nextAction = !s.closedAt && (pendingAward && award ? (
      <>
        <p><strong>{usd(award.terms.amountMinor)}</strong> awarded for {award.terms.title}.</p>
        <p>Target date <time dateTime={award.terms.due}>{award.terms.due}</time> (UTC)</p>
        <p className="wrap-anywhere whitespace-pre-wrap">{award.terms.acceptance}</p>
        {data.writer ? confirmAward() : <>
          <p className="text-sm text-fg-muted">A project editor can confirm this award.</p>
          <Link href={`${base}?tab=Decision`} className={actionLink}>Review award terms</Link>
        </>}
      </>
    ) : canSubmitMilestone ? (
      <>
        <p>{delivery?.state === 'changes_requested' ? 'Update your evidence using the reviewer’s feedback.' : 'Share evidence that you completed the cleared milestone.'}</p>
        {delivery?.review?.note && <p className="wrap-anywhere whitespace-pre-wrap">{delivery.review.note}</p>}
        {data.writer ? milestoneEvidenceForm(delivery ? 'Resubmit milestone evidence' : 'Submit milestone evidence')
          : <p className="text-sm text-fg-muted">A project editor can submit milestone evidence.</p>}
      </>
    ) : pendingAmendment?.state === 'changes_requested' ? (
      <>
        <p>The grant team requested changes to your proposed award terms.</p>
        {pendingAmendment.review && <p className="wrap-anywhere whitespace-pre-wrap">{pendingAmendment.review}</p>}
        {data.writer && active && !s.payments.length && !['submitted', 'accepted'].includes(delivery?.state ?? '') ? (
          <Link href={`${base}?tab=Amendments`} className={actionLink}>Revise and resubmit</Link>
        ) : <Link href={`${base}?tab=Amendments`} className={actionLink}>View requested changes</Link>}
      </>
    ) : data.writer && pendingAmendment?.state === 'approved' ? (
      <Link href={`${base}?tab=Amendments`} className={actionLink}>Review updated award terms</Link>
    ) : data.writer && canDeliver ? (
      <>
        <p>{delivery?.state === 'changes_requested' ? 'The grant team requested changes to your evidence.' : 'Share your evidence when your milestone is ready.'}</p>
        <Link href={`${base}?tab=Delivery`} className={actionLink}>{delivery ? 'Update milestone evidence' : 'Submit milestone evidence'}</Link>
      </>
    ) : data.writer && dueCheckpoint ? (
      <Link href={`${base}?tab=Impact&day=${dueCheckpoint}`} className={actionLink}>Complete your {dueCheckpoint}-day update</Link>
    ) : null)
    content = (
      <div className="max-w-4xl space-y-5">
        <SectionCard title="Application status" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusPill className="text-fg-heading" tone={s.status === 'approved' ? 'success' : 'info'}>{milestoneStage ?? statusCopy.label}</StatusPill>
            {milestoneStage && s.status === 'submitted' && publicStatus.status !== 'submitted' &&
              <StatusPill className="text-fg-heading">{statusCopy.label}</StatusPill>}
          </div>
          {s.status !== 'approved' && !milestoneStage && <p className="text-fg-muted">{statusDetail}</p>}
          {milestoneFirst && <ApplicantReceipt recorded={delivery?.state === 'submitted'}>Evidence submitted</ApplicantReceipt>}
          {milestoneFirst && delivery?.state === 'submitted' && (
            <div className="space-y-2">
              <p className="text-sm text-fg-muted">Submitted <time dateTime={delivery.at}>{delivery.at.slice(0, 10)}</time> (UTC)</p>
              {deliveryLinks(delivery)}
              <p className="wrap-anywhere whitespace-pre-wrap">{delivery.note}</p>
            </div>
          )}
          {milestoneFirst && delivery?.state === 'accepted' && s.status === 'submitted' &&
            <p className="text-fg-muted">The grant team verified the evidence. A separate award decision is pending.</p>}
          {!publicStatus.updateRequested && !nextAction && <p>No action is needed right now.</p>}
          {s.closedAt && <p className="text-fg-muted">This grant is complete.</p>}
          {decision?.publicNote && <p className="wrap-anywhere whitespace-pre-wrap">{decision.publicNote}</p>}
          {award && !milestoneFirst && <ApplicantReceipt key={award.number} recorded={!!award.confirmedAt}>Award confirmation recorded</ApplicantReceipt>}
        </SectionCard>
        {(requests.length > 0 || nextAction) && <SectionCard title={publicStatus.updateRequested || nextAction ? 'What happens next' : 'Saved responses'} className="space-y-4">
          {requests.map((request) => requestCard(request, true))}
          {nextAction}
        </SectionCard>}
        {award && !pendingAward && (
          <SectionCard title={milestoneFirst ? 'Award receipt' : 'What the grant covers'} className="space-y-3">
            <p><strong>{usd(award.terms.amountMinor)}</strong> awarded</p>
            {milestoneFirst && decision && <p>Issued <time dateTime={decision.at}>{decision.at.slice(0, 10)}</time> (UTC)</p>}
            {milestoneFirst && <p className="text-sm text-fg-muted">Verified milestone</p>}
            <p>{award.terms.title} · <time dateTime={award.terms.due}>{award.terms.due}</time> (UTC)</p>
            <p className="wrap-anywhere whitespace-pre-wrap">{award.terms.acceptance}</p>
          </SectionCard>
        )}
        <SectionCard title={award ? 'Original request' : 'What you requested'} className="space-y-3">
          {requestedAmount != null && <p><strong>{usd(requestedAmount)}</strong> requested</p>}
          <p className="wrap-anywhere whitespace-pre-wrap">{short?.summary ?? legacy?.outcome}</p>
          {short?.milestone && <>
            <p>{short.milestone.title} · <time dateTime={short.milestone.due}>{short.milestone.due}</time> (UTC)</p>
            <p className="wrap-anywhere whitespace-pre-wrap">{short.milestone.evidence}</p>
          </>}
          {legacy?.terms.title && (
            <p>{legacy.terms.title}{legacy.terms.due && <> · <time dateTime={legacy.terms.due}>{legacy.terms.due}</time> (UTC)</>}</p>
          )}
        </SectionCard>
      </div>
    )
  } else if (tab === 'Application details' && !data.staff) {
    const linkClass = 'inline-flex min-h-11 items-center underline underline-offset-4'
    content = (
      <div className="max-w-4xl space-y-5">
        <SectionCard title={s.status === 'draft' ? 'Saved application details' : 'Submitted application'} className="space-y-4">
          {legacyDetails ?? shortRequest}
        </SectionCard>
        {s.requests.length > 0 && <SectionCard title="Requests and replies" className="space-y-4">
          {s.requests.map((request) => requestCard(request, true, false))}
        </SectionCard>}
        {t && <SectionCard title="Released award" className="space-y-4">{termsView(t.terms)}</SectionCard>}
        <SectionCard title="Shared records" className="space-y-3">
          <ul className="flex flex-wrap gap-x-5">
            {[
              ['Requests', 'Requests and replies', s.requests.length > 0],
              ['Decision', 'Decision and award', s.decisions.length > 0],
              ['Delivery', 'Milestone evidence', !!active || !!clearedAt],
              ['Amendments', 'Changes to award terms', (!milestoneFirst && !!active) || s.amendments.length > 0],
              ['Payments', 'Payment record', s.status === 'approved'],
              ['Impact', 'Impact updates', !!s.impactPlan],
            ].map(([key, label, show]) => show && (
              <li key={String(key)}><Link href={`${base}?tab=${key}`} className={linkClass}>{label}</Link></li>
            ))}
          </ul>
          <p className="text-sm text-fg-muted">Shared project information is recorded with your application.</p>
          <ProjectVersionView version={data.projectVersion} />
        </SectionCard>
      </div>
    )
  } else if (tab === 'Overview' || tab === 'Application') {
    const nextStep = (
      <SectionCard title="Applicant visibility" className="self-start space-y-4 lg:col-start-2 lg:row-start-1">
        {s.status === 'draft' && !data.continuous && !data.roundOpen && <p>You can keep editing this draft. You can submit when this round reopens.</p>}
        <p className="text-fg-muted">{statusCopy.detail}</p>
        {publicStatus.updateRequested && (
          <Link href={`${base}?tab=Requests`} className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">
            View outstanding requests
          </Link>
        )}
        {s.status === 'approved' && (
          <Link href={`${base}?tab=${active ? 'Delivery' : 'Decision'}`} className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">
            {active ? 'View delivery' : 'Review award terms'}
          </Link>
        )}
        {['deferred', 'not_selected'].includes(s.status) && (
          <Link href={`${base}?tab=Decision`} className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">Read decision note</Link>
        )}
      </SectionCard>
    )
    content = (
      <div className={data.staff ? 'grid gap-10 lg:grid-cols-[2fr_1fr]' : 'max-w-4xl space-y-5'}>
        {!data.staff && (
          <div className="min-w-0 space-y-5">
            <SectionCard title="Application status" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={s.status === 'approved' ? 'success' : 'info'}>{statusCopy.label}</StatusPill>
                {maturity && <StatusPill tone="neutral">Project stage {maturity.label}</StatusPill>}
                {s.status === 'approved' && <StatusPill tone={workflowTone}>{workflowLabel}</StatusPill>}
                {!data.continuous && !editShortDraft && <RoundIntakeStatus open={data.roundOpen} />}
              </div>
              <p className="text-fg-muted">{statusCopy.detail}</p>
              {s.status === 'draft' && !data.roundOpen && !short && <p>You can keep editing this draft. Submit when intake reopens.</p>}
            </SectionCard>
          </div>
        )}
        <section className={data.staff ? 'min-w-0 space-y-8 lg:col-start-1 lg:row-start-1' : 'min-w-0 space-y-8'}>
          <h2 className="text-lg">{data.staff ? 'Application' : s.status === 'draft' ? 'Your draft' : 'What you requested'}</h2>
          {editShortDraft && short ? (
            <ShortGrantForm
              key={`${data.id}:${data.revision}`}
              draft={{ id: data.id, revision: data.revision, projectName: data.name, roundName: data.round, answers: short }}
              roadmaps={[{ id: data.projectId, slug: data.projectSlug, milestones: data.milestones }]}
              roundOpen={data.roundOpen}
              continuous={data.continuous}
              demoProofMissing={data.demoProofMissing}
            />
          ) : data.writer && s.status === 'draft' && legacy ? (
            <>
              {form(
                'save_application',
                'Save draft',
                {
                  answers: legacy,
                },
                applicationFields.map((f) => ({
                  ...f,
                  optional: true,
                })),
                false,
                [costRepeater()],
              )}
            </>
          ) : legacy ? (
            legacyDetails
          ) : (
            <>
              {shortRequest}
              {!data.staff && data.writer && s.status === 'draft' && short && (
                <p className="text-sm text-fg-muted">Editing and submitting short drafts is temporarily unavailable. Your saved draft is unchanged.</p>
              )}
            </>
          )}
        </section>
        {data.staff && nextStep}
      </div>
    )
  } else if (tab === 'Evidence') content = <ProjectVersionView version={data.projectVersion} />
  if ((tab === 'Evaluation' || oneCase) && internal) {
    const result = score(internal.assessment),
      holds = readiness(internal, requestedRoute)
    const assessment = (
      <div className="grid gap-10 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-5">
          <h2 className="text-lg">Evidence and context</h2>
          {!oneCase && (legacy ? termsView(legacy.terms) : shortRequest)}
          <Link href={`${base}?tab=Evidence`} className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">
            Inspect the pinned project version
          </Link>
          <dl className="grid grid-cols-3 gap-3 border-y border-line py-4 text-sm">
            <div>
              <dt>Provisional</dt>
              <dd className="mt-1 text-xl">{result.total === null ? 'ND' : `${result.total.toFixed(1)} / 3`}</dd>
            </div>
            <div>
              <dt>Evidence bounds</dt>
              <dd className="mt-1 text-xl">
                {result.lower.toFixed(1)}-{result.upper.toFixed(1)}
              </dd>
            </div>
            <div>
              <dt>E coverage</dt>
              <dd className="mt-1 text-xl">{result.coverage}%</dd>
            </div>
          </dl>
          {holds.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <h3>Funding holds</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {holds.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {!oneCase && requestEvidence()}
        </section>
        <section>
          <h2 className="mb-5 text-lg">Evaluation</h2>
          <p className="mb-5 text-xs text-fg-muted">
            Internal framework v2.0 proposal. E is evidence-supported; S is stated. ND is unassessed. Scores never grant funding authority.
          </p>
          {capabilities?.review && s.status === 'submitted' ? (
            form(
              'save_assessment',
              'Save assessment',
              {
                assessment: internal.assessment,
              },
              assessmentFields,
            )
          ) : (
            <p>Assessment is read-only for this state or account.</p>
          )}
        </section>
      </div>
    )
    if (oneCase) caseAssessment = assessment
    else content = assessment
  }

  if (tab === 'Requests' || oneCase) {
    const requests = !s.requests.length ? (
      <EmptyState title="No evidence requests">Requests for clarification will appear here.</EmptyState>
    ) : (
      <div className="space-y-8">
        {s.requests.map((request) => requestCard(request))}
      </div>
    )
    if (oneCase) caseRequests = (
      <SectionCard title="Requests" className="space-y-4">
        {requests}
        {requestEvidence()}
      </SectionCard>
    )
    else content = requests
  }

  if (tab === 'Decision' && data.staff && data.state.version === 3) {
    const state = data.state
    const milestone = state.answers.milestone
    const lastDecision = state.decisions.at(-1)
    const verified = !!state.milestoneClearance && lastDelivery?.state === 'accepted'
    const openRequest = state.requests.some((request) => !request.answeredAt)
    const assessmentHolds = verified ? readiness(state) : []
    const awaitingDecision = state.status === 'submitted' && state.decisions.every((decision) => decision.outcome === 'deferred')
    const decide = data.capabilities.decide
    const actionClass = 'inline-flex min-h-11 items-center underline underline-offset-4'
    const HoldLink = oneCase ? 'a' : Link
    const hold: { title: string; detail: string; tab?: keyof typeof caseSectionIds; link?: string } | null = openRequest ? {
      title: 'Evidence request open', detail: 'The applicant needs to reply. The grant reviewer can check the request and reassess the application.',
      tab: 'Requests', link: 'Open requests',
    } : !verified ? {
      title: !oneCase ? 'Milestone verification required' : !clearedAt ? 'Allow evidence submission'
        : lastDelivery?.state === 'submitted' ? 'Review submitted evidence'
          : lastDelivery?.state === 'changes_requested' ? 'Waiting for revised evidence' : 'Waiting for milestone evidence',
      detail: !clearedAt ? 'Staff with grant decision access must clear the pinned milestone.'
        : lastDelivery?.state === 'submitted' ? 'The milestone verifier must review the submitted evidence.'
          : oneCase && lastDelivery?.state === 'changes_requested' ? 'The applicant needs to revise and resubmit their evidence.'
            : 'The applicant needs to submit the milestone evidence for the verifier.',
      tab: clearedAt ? 'Delivery' : undefined, link: oneCase ? 'Go to evidence' : 'Open delivery',
    } : assessmentHolds.length ? {
      title: 'Assessment required', detail: 'The grant reviewer must address the readiness checks before the decision owner can issue.',
      tab: 'Evaluation', link: oneCase ? 'Go to assessment' : 'Open evaluation',
    } : !decide ? {
      title: 'Decision access required', detail: 'Staff with grant decision access can record an outcome.',
    } : null
    const canEnterAward = decide && awaitingDecision && !hold
    const award = lastDecision?.outcome === 'approved' ? lastDecision.terms : null
    const decision = (
      <div className="max-w-4xl space-y-5">
        {oneCase && !awaitingDecision && !lastDecision && (
          <SectionCard title="Next action"><p>No grant decision is pending for this case.</p></SectionCard>
        )}
        {awaitingDecision && hold && (
          <SectionCard title={hold.title} className="space-y-3">
            <p>{hold.detail}</p>
            {hold.tab && <HoldLink href={staffSectionHref(hold.tab)} className={actionClass}>{hold.link}</HoldLink>}
            {!oneCase && hold.tab === 'Evaluation' && (
              <details className="rounded-lg border border-line px-3">
                <summary className="min-h-11 cursor-pointer py-3">Readiness checks</summary>
                <ul className="list-disc space-y-2 pb-3 pl-5">{assessmentHolds.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              </details>
            )}
            {decide && !clearedAt && !openRequest && !publicStatus.updateRequested && form(
              'clear_milestone', 'Clear pinned milestone', { confirm: false },
              [{ path: 'confirm', label: 'I reviewed the submitted milestone. Clearance does not issue an award or authorize payment.', type: 'checkbox' }], true,
            )}
          </SectionCard>
        )}
        {award && lastDecision && (
          <SectionCard title="Award issued" className="space-y-3">
            <p><strong>{usd(award.amountMinor)}</strong> issued on <time dateTime={lastDecision.at}>{lastDecision.at.slice(0, 10)}</time> (UTC)</p>
            <p className="wrap-anywhere whitespace-pre-wrap">{lastDecision.publicNote}</p>
            <details className="rounded-lg border border-line px-3">
              <summary className="min-h-11 cursor-pointer py-3">Open staff decision record</summary>
              <div className="space-y-3 pb-4">
                {termsView(award)}
                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Decision owner', data.owners.find((owner) => owner.value === lastDecision.ownerId)?.label ?? 'Unavailable'],
                    ['Funding route', award.route === 'bounded_pilot' ? 'Bounded pilot' : 'Established impact'],
                    ['Budget authorization reference', lastDecision.budget],
                    ['Approval reference', lastDecision.authority],
                    ['Staff-only reason', lastDecision.rationale],
                    ...(award.route === 'bounded_pilot' ? [['Pilot hypothesis', award.hypothesis], ['Pilot limits', award.limits]] : []),
                  ].map(([label, value]) => (
                    <div key={label}><dt className="text-sm text-fg-muted">{label}</dt><dd className="wrap-anywhere whitespace-pre-wrap">{value}</dd></div>
                  ))}
                </dl>
              </div>
            </details>
          </SectionCard>
        )}
        {!oneCase && milestone && (
          <SectionCard title={verified ? 'Verified milestone' : 'Pinned milestone'} className="space-y-3">
            <p>{milestone.title} · <time dateTime={milestone.due}>{milestone.due}</time> (UTC)</p>
            <p className="wrap-anywhere whitespace-pre-wrap">{milestone.evidence}</p>
            {verified && lastDelivery && deliveryLinks(lastDelivery)}
            {!canEnterAward && requestedAmount != null && <p><strong>{usd(requestedAmount)}</strong> requested</p>}
            <Link href={`${base}?tab=Application`} className={actionClass}>Read the full application</Link>
          </SectionCard>
        )}
        {canEnterAward && milestone && (
          <SectionCard title="Award decision">
            <StaffAwardForm key={`${data.id}:${data.revision}`} applicationId={data.id} revision={data.revision}
              milestone={{ title: milestone.title, due: milestone.due, acceptance: milestone.evidence }}
              requested={requestedAmount == null ? undefined : usd(requestedAmount)}
              owners={data.owners} evaluationHref={staffSectionHref('Evaluation')} establishedHolds={readiness(state, 'established_impact')} />
          </SectionCard>
        )}
        {decide && awaitingDecision && form(
          'record_decision', 'Reject or defer',
          { outcome: '', ownerId: data.userId, terms: null, authority: '', budget: '', rationale: '', publicNote: '' },
          [
            { path: 'outcome', label: 'Outcome', type: 'select', options: [{ value: 'not_selected', label: 'Reject' }, { value: 'deferred', label: 'Defer' }] },
            { ...ownerField, label: 'Decision owner' },
            { path: 'authority', label: 'Approval reference' },
            { path: 'publicNote', label: 'Note for the applicant', type: 'textarea' },
            { path: 'rationale', label: 'Staff-only reason', type: 'textarea' },
          ], true,
        )}
        {state.decisions.some((decision) => decision.outcome !== 'approved') && (
          <SectionCard title="Recorded outcomes" className="space-y-4">
            {state.decisions.filter((decision) => decision.outcome !== 'approved').map((decision) => (
              <section key={decision.id} className="space-y-2 border-b border-line pb-4">
                <p>{applicationStatusCopy[decision.outcome].label} · <time dateTime={decision.at}>{decision.at.slice(0, 10)}</time> (UTC)</p>
                <p className="wrap-anywhere whitespace-pre-wrap">{decision.publicNote}</p>
              </section>
            ))}
            {decide && state.status === 'deferred' && form(
              'reopen_application', 'Reopen application', { confirm: false },
              [{ path: 'confirm', label: 'Return this application to review and keep the previous decision in its history.', type: 'checkbox' }], true,
            )}
          </SectionCard>
        )}
      </div>
    )
    if (oneCase) caseDecision = decision
    else content = decision
  } else if (tab === 'Decision') {
    const assessmentHolds = internal ? readiness(internal, requestedRoute) : []
    content = (
      <div className={data.staff ? 'grid gap-6 lg:grid-cols-[1fr_2fr]' : 'max-w-4xl'}>
        {internal && (
          <aside className="min-w-0 space-y-5">
            <SectionCard title="Application at a glance" className="space-y-3">
              {requestedAmount != null && <p><strong>{usd(requestedAmount)}</strong> requested</p>}
              <p className="whitespace-pre-wrap">{short?.summary ?? legacy?.outcome}</p>
              <Link href={`${base}?tab=Application`} className="inline-flex min-h-11 items-center underline underline-offset-4">Read the full application</Link>
            </SectionCard>
            <SectionCard title={short ? 'Assessment readiness' : 'Assessment readiness for the requested route'} className="space-y-3">
              <p className="text-sm text-fg-muted">
                {short ? 'Select the funding route in the award terms. Route-specific checks run before approval.' : `Requested route: ${requestedRoute === 'bounded_pilot' ? 'Bounded pilot' : 'Established impact'}`}
              </p>
              {assessmentHolds.length ? (
                <details className="rounded-lg border border-line px-3">
                  <summary className="min-h-11 cursor-pointer py-3">View assessment readiness checks</summary>
                  <ul className="list-disc space-y-2 pb-3 pl-4">
                    {assessmentHolds.map((reason) => <li key={reason} className="text-sm">{reason}</li>)}
                  </ul>
                </details>
              ) : <p className="text-sm text-fg-muted">{short ? 'No general assessment readiness issues.' : 'No assessment readiness issues for the requested route.'}</p>}
              <h3 className="text-sm font-medium">Approval requirements</h3>
              <p className="text-sm text-fg-muted">
                Resolve outstanding evidence requests and check assessment readiness for the route in the agreed terms.
                Record the budget authority and approval references, and set a target date of today or later.
              </p>
              <p className="text-sm text-fg-muted">
                The assessment covers evidence, eligibility, rights, conflicts, security, funding and continuity.
                A bounded pilot needs a hypothesis and risk limits. Established impact requires c9 at least 2E.
              </p>
              <Link href={`${base}?tab=Evaluation`} className="inline-flex min-h-11 items-center underline underline-offset-4">Open evaluation</Link>
            </SectionCard>
          </aside>
        )}
        <SectionCard title="Decision" className="min-w-0 space-y-6">
          {data.staff && <p className="text-fg-muted">Record the decision here. The score and the authorised award amount are separate.</p>}
          {s.decisions.map((decision, index) => (
            <section key={index} className="space-y-2 border-b border-line pb-4">
              <p className="text-sm font-medium">
                {applicationStatusCopy[decision.outcome].label} · <time dateTime={decision.at}>{decision.at.slice(0, 10)}</time>
              </p>
              <p className="whitespace-pre-wrap">{decision.publicNote}</p>
            </section>
          ))}
          {capabilities?.decide && s.status === 'deferred' && form(
            'reopen_application',
            'Reopen application',
            { confirm: false },
            [{ path: 'confirm', label: 'Return this application to review and keep the previous decision in its history.', type: 'checkbox' }],
            true,
          )}
          {milestoneFirst && s.status === 'submitted' && (
            <section className="space-y-3">
              <h3>Pinned milestone</h3>
              <p>{short?.milestone?.title} · {short?.milestone?.due} (UTC)</p>
              <p className="whitespace-pre-wrap">{short?.milestone?.evidence}</p>
            </section>
          )}
          {milestoneFirst && s.status === 'submitted' && lastDelivery?.state !== 'accepted' &&
            <p className="text-sm text-fg-muted">The award can be issued only after milestone evidence is verified.</p>}
          {internal && capabilities?.decide && s.status === 'submitted' ? (
            form(
              'record_decision',
              'Record authorised decision',
              {
                outcome: 'approved',
                terms: legacy?.terms ?? {
                  title: short?.milestone?.title,
                  due: short?.milestone?.due,
                  acceptance: short?.milestone?.evidence,
                  amountMinor: short?.amountMinor,
                },
                ownerId: data.userId,
                rationale: '',
                publicNote: '',
                budget: '',
                authority: '',
              },
              [
                {
                  path: 'outcome',
                  label: 'Decision outcome',
                  type: 'select',
                  options: options('approved', 'deferred', 'not_selected'),
                },
                ownerField,
                ...termsFields(),
                {
                  path: 'budget',
                  label: 'Budget authority reference',
                  optional: true,
                },
                {
                  path: 'authority',
                  label: 'Approval reference',
                },
                {
                  path: 'rationale',
                  label: 'Internal rationale',
                  type: 'textarea',
                },
                {
                  path: 'publicNote',
                  label: 'Applicant-facing note',
                  type: 'textarea',
                },
              ],
            )
          ) : s.decisions.length ? (
            <>
              {t && termsView(t.terms)}
              {t && !milestoneFirst && (
                <p className="text-sm text-fg-muted">
                  Terms v{t.number}: {t.confirmedAt ? `Confirmed ${t.confirmedAt.slice(0, 10)}` : 'Awaiting applicant confirmation'}
                </p>
              )}
              {!milestoneFirst && !data.staff && data.writer && t && !t.confirmedAt && confirmAward()}
            </>
          ) : (
            <EmptyState title="No decision recorded">An authorised decision will appear here when review is complete.</EmptyState>
          )}
        </SectionCard>
      </div>
    )
  }

  if (tab === 'Delivery' || oneCase) {
    const last = s.deliveries.at(-1)
    const clearedRevision = internal?.version === 3 ? internal.milestoneClearance?.applicationRevisionId : undefined
    const pinnedAnswers = clearedRevision ? internal?.applications.find((application) => application.id === clearedRevision)?.answers : undefined
    const criterion = pinnedAnswers?.intakeVersion === 2 ? pinnedAnswers.milestone?.evidence : undefined
    const delivery = (
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-6">
          <h2 className="text-lg">{oneCase ? 'Milestone evidence' : 'Verify the agreed milestone.'}</h2>
          {!oneCase && <>
            <p>Review the submitted evidence against the agreed terms.</p>
            {active ? termsView(active.terms) : milestoneFirst && short?.milestone ? (
              <p>{short.milestone.title} · {short.milestone.due} (UTC)</p>
            ) : <p>Confirm the terms before delivery.</p>}
          </>}
          {oneCase && !s.deliveries.length && <p className="text-fg-muted">No milestone evidence submitted yet.</p>}
          {s.deliveries.map((d, i) => (
            <section key={d.id} className="space-y-3 border-t border-line pt-5">
              <h3>
                {milestoneFirst ? `Evidence submission ${i + 1}` : `Delivery v${i + 1} / terms v${d.termsVersion}`}
              </h3>
              <StatusPill className="text-fg-heading" tone={d.state === 'accepted' ? 'success' : 'info'}>{d.state.replaceAll('_', ' ')}</StatusPill>
              {deliveryLinks(d)}
              <p>{d.note}</p>
              {d.review && <p className="text-sm text-fg-muted">Verifier note: {d.review.note}</p>}
            </section>
          ))}
        </section>
        <section>
          <h2 className="mb-5 text-lg">{data.staff ? 'Verification result' : 'Submit milestone delivery'}</h2>
          {milestoneFirst && data.staff && capabilities?.verify && last?.state === 'submitted' && s.status === 'submitted' && (
            <SectionCard title="Pinned completion evidence" className="mb-5">
              <p className="wrap-anywhere whitespace-pre-wrap">{criterion ?? 'Review the pinned submission before recording a verification.'}</p>
            </SectionCard>
          )}
          {data.staff && capabilities?.verify && last?.state === 'submitted' && (!milestoneFirst || s.status === 'submitted') ? (
            form(
              'review_delivery',
              'Record verification',
              {
                deliveryId: last.id,
                outcome: 'accepted',
                inspected: false,
                reproduced: false,
                matches: false,
                note: '',
                evidence: '',
              },
              [
                {
                  path: 'outcome',
                  label: 'Outcome',
                  type: 'select',
                  options: options('accepted', 'changes_requested'),
                },
                note,
                evidence,
                {
                  path: 'inspected',
                  label: 'Agreed output inspected',
                  type: 'checkbox',
                },
                {
                  path: 'reproduced',
                  label: 'Acceptance test reproduced',
                  type: 'checkbox',
                },
                {
                  path: 'matches',
                  label: 'Scope and version match',
                  type: 'checkbox',
                },
              ],
            )
          ) : !data.staff && data.writer && (milestoneFirst ? canSubmitMilestone : active && !['submitted', 'accepted'].includes(last?.state || '')) ? (
            milestoneEvidenceForm('Submit delivery evidence')
          ) : (
            <p className="text-sm text-fg-muted">
              {last?.state === 'submitted'
                ? 'Awaiting verification.'
                : last?.state === 'accepted'
                  ? 'Milestone accepted.'
                  : 'Delivery is not ready for a new action.'}
            </p>
          )}
        </section>
      </div>
    )
    if (oneCase) caseEvidence = <SectionCard>{delivery}</SectionCard>
    else content = delivery
  } else if (tab === 'Payments')
    content = (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg">Track external payments.</h2>
            <p className="mt-2">Record evidence of payments made through the authorised finance process.</p>
          </div>
          {capabilities?.payments && (!milestoneFirst || s.status === 'approved') &&
            form(
              'report_payment',
              'Record payment report',
              {
                reference: '',
                amountMinor: 0,
                date: '',
                evidence: '',
                note: '',
              },
              [
                {
                  path: 'reference',
                  label: 'Unique external payment reference',
                },
                {
                  path: 'amountMinor',
                  label: 'Payment amount (USD)',
                  type: 'money',
                },
                {
                  path: 'date',
                  label: 'Payment date (UTC calendar day)',
                  type: 'date',
                },
                evidence,
                note,
              ],
              true,
            )}
        </div>
        <dl className="grid gap-5 border-y border-line py-5 sm:grid-cols-3">
          {[
            ['Approved', amounts.approved],
            ['Confirmed paid', amounts.paid],
            ['Remaining obligation', amounts.remaining],
          ].map(([label, value]) => (
            <div key={label}>
              <dd className="text-3xl">{usd(Number(value))}</dd>
              <dt className="mt-1 text-sm text-fg-muted">{label}</dt>
            </div>
          ))}
        </dl>
        <DataTable
          id={`grant:${data.id}:payments`}
          columns={[
            {
              key: 'amount',
              label: 'Amount (USD)',
              hideable: false,
            },
            {
              key: 'date',
              label: 'Payment date',
            },
            {
              key: 'status',
              label: 'Status',
            },
            ...(capabilities?.payments
              ? [
                  {
                    key: 'reference',
                    label: 'Reference',
                  },
                  {
                    key: 'action',
                    label: 'Reconciliation',
                  },
                ]
              : []),
          ]}
          rows={s.payments.map((p) => {
            const finance = internal?.payments.find((r) => r.id === p.id)
            return {
              id: p.id,
              cells: {
                amount: usd(p.amountMinor),
                date: p.date,
                status: (
                  <StatusPill className="text-fg-heading" tone={p.state === 'confirmed' ? 'success' : p.state === 'reported' ? 'warning' : 'neutral'}>
                    {p.state}
                  </StatusPill>
                ),
                reference: capabilities?.payments ? finance?.reference : null,
                action:
                  capabilities?.payments && finance
                    ? form(
                        'reconcile_payment',
                        'Reconcile record',
                        {
                          paymentId: p.id,
                          state: p.state === 'confirmed' ? 'reversed' : 'confirmed',
                          evidence: finance.evidence,
                          note: '',
                        },
                        [
                          {
                            path: 'state',
                            label: 'Reconciled status',
                            type: 'select',
                            options: options(
                              ...(p.state === 'confirmed'
                                ? ['reversed', 'disputed']
                                : ['confirmed', 'uncertain', 'failed', 'reversed', 'disputed']),
                            ),
                          },
                          evidence,
                          note,
                        ],
                        true,
                      )
                    : null,
              },
            }
          })}
        />
        <p className="text-sm text-fg-muted">
          Only confirmed settlement counts as paid. Reported, uncertain and disputed payments stay reserved until reconciled. No money is
          sent by this module.
        </p>
      </div>
    )
  else if (tab === 'Amendments')
    content = (
      <div className="space-y-8">
        <h2 className="text-lg">Review proposed changes to agreed terms.</h2>
        <p>Current terms remain active until renewed review and applicant confirmation.</p>
        {active && termsView(active.terms)}
        {s.amendments.map((a) => (
          <section key={a.id} className="space-y-5 border-t border-line pt-6">
            <h3>Proposed amendment / base terms v{a.baseVersion}</h3>
            <StatusPill className="text-fg-heading" tone={a.state === 'confirmed' ? 'success' : 'info'}>{a.state.replaceAll('_', ' ')}</StatusPill>
            {termsView(a.terms)}
            <p>{a.reason}</p>
            {a.review && <p>Reviewer: {a.review}</p>}
            {capabilities?.decide &&
              a.state === 'submitted' &&
              form(
                'review_amendment',
                'Review amendment',
                {
                  amendmentId: a.id,
                  state: 'approved',
                  renewed: false,
                  review: '',
                  authority: '',
                },
                [
                  {
                    path: 'state',
                    label: 'Outcome',
                    type: 'select',
                    options: options('approved', 'changes_requested'),
                  },
                  {
                    path: 'review',
                    label: 'Renewed scope, funding and risk review shared with applicant',
                    type: 'textarea',
                  },
                  {
                    path: 'authority',
                    label: 'Renewed approval reference',
                  },
                  {
                    path: 'renewed',
                    label: 'I reviewed current scope, funding overlap, rights, conflicts and risks for the amended terms.',
                    type: 'checkbox',
                  },
                ],
                true,
              )}
            {!data.staff &&
              data.writer &&
              ['submitted', 'changes_requested', 'approved'].includes(a.state) &&
              form(
                'respond_amendment',
                'Respond to amendment',
                {
                  amendmentId: a.id,
                  response: a.state === 'approved' ? 'confirmed' : 'withdrawn',
                  note: '',
                },
                [
                  {
                    path: 'response',
                    label: 'Response',
                    type: 'select',
                    options: options(...(a.state === 'approved' ? ['confirmed', 'declined', 'withdrawn'] : ['withdrawn'])),
                  },
                  note,
                ],
                true,
              )}
          </section>
        ))}
        {!data.staff &&
          data.writer &&
          active &&
          !s.payments.length &&
          !['submitted', 'accepted'].includes(s.deliveries.at(-1)?.state || '') &&
          form(
            'submit_amendment',
            'Propose amended terms',
            {
              terms: active.terms,
              reason: '',
            },
            [
              ...termsFields().filter((field) => !short ||
                ['terms.title', 'terms.acceptance', 'terms.amountMinor', 'terms.due', 'terms.maintainer'].includes(field.path)),
              {
                path: 'reason',
                label: 'What changed and why?',
                type: 'textarea',
              },
            ],
            true,
          )}
      </div>
    )
  else if (tab === 'Follow-ups' && internal)
    content = (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg">Every case has a next useful action.</h2>
          {capabilities?.review &&
            form(
              'save_followup',
              'Add follow-up',
              {
                title: '',
                ownerId: data.userId,
                due: '',
                waitingOn: 'Reviewer',
                note: '',
              },
              [
                {
                  path: 'title',
                  label: 'Next action',
                },
                ownerField,
                {
                  path: 'due',
                  label: 'Due date (UTC calendar day)',
                  type: 'date',
                },
                {
                  path: 'waitingOn',
                  label: 'Waiting on',
                },
                {
                  ...note,
                  label: 'Internal progress note',
                },
              ],
              true,
            )}
        </div>
        {internal.followups.map((f) => (
          <section key={f.id} className="space-y-4 border-t border-line pt-5">
            <h3>{f.title}</h3>
            <p className="text-sm text-fg-muted">
              {f.state} / due {f.due} / waiting on {f.waitingOn}
            </p>
            <p>{f.note}</p>
            {f.reminderDraft && (
              <div className="rounded-lg border border-line p-4">
                <StatusPill className="text-fg-heading" tone="warning">Pending review / Unsent</StatusPill>
                <p className="mt-2 whitespace-pre-wrap">{f.reminderDraft}</p>
              </div>
            )}
            {capabilities?.review && (
              <div className="flex flex-wrap gap-3">
                {form(
                  'save_followup',
                  'Reschedule or update',
                  {
                    followupId: f.id,
                    title: f.title,
                    ownerId: f.ownerId,
                    due: f.due,
                    waitingOn: f.waitingOn,
                    note: '',
                  },
                  [
                    {
                      path: 'title',
                      label: 'Next action',
                    },
                    {
                      path: 'due',
                      label: 'Due date',
                      type: 'date',
                    },
                    {
                      path: 'waitingOn',
                      label: 'Waiting on',
                    },
                    {
                      ...note,
                      label: 'Reason or progress note',
                    },
                  ],
                  true,
                )}
                {form(
                  'finish_followup',
                  f.state === 'open' ? 'Complete action' : 'Reopen action',
                  {
                    followupId: f.id,
                    reopen: f.state !== 'open',
                    note: '',
                  },
                  [
                    {
                      ...note,
                      label: 'Completion or reopening note',
                    },
                  ],
                  true,
                )}
                {f.state === 'open' &&
                  form(
                    'draft_reminder',
                    'Draft reminder',
                    {
                      followupId: f.id,
                      body: f.reminderDraft,
                    },
                    [
                      {
                        path: 'body',
                        label: 'Reminder draft / not sent',
                        type: 'textarea',
                      },
                    ],
                    true,
                  )}
              </div>
            )}
          </section>
        ))}
      </div>
    )
  else if (tab === 'Impact') {
    const report = s.impact.findLast((r) => r.day === day),
      accepted = s.deliveries.findLast((d) => d.state === 'accepted')
    content = (
      <div className="space-y-8">
        <nav className="grid gap-3 sm:grid-cols-3" aria-label="Impact checkpoints">
          {['30', '90', '180'].map((d) => {
            const r = s.impact.findLast((r) => r.day === d)
            return (
              <Link
                href={`${base}?tab=Impact&day=${d}`}
                key={d}
                aria-current={day === d ? 'page' : undefined}
                className={`min-h-11 rounded-lg border p-4 text-sm ${day === d ? 'border-brand' : 'border-line'}`}
              >
                {d} days / {r?.state || 'Awaiting update'}
              </Link>
            )
          })}
        </nav>
        <h2 className="text-lg">
          {data.staff ? 'Review' : 'Your'} {day}-day update.
        </h2>
        {accepted?.review?.at && (
          <p className="text-sm text-fg-muted">
            Due {addDays(accepted.review.at.slice(0, 10), Number(day))}. Checkpoints are anchored to accepted delivery, not award date.
          </p>
        )}
        {s.impactPlan ? (
          <>
            <DataTable
              id={`grant:${data.id}:impact:${day}`}
              columns={[
                {
                  key: 'metric',
                  label: 'Agreed metric',
                  hideable: false,
                },
                {
                  key: 'baseline',
                  label: 'Baseline',
                },
                {
                  key: 'target',
                  label: 'Target',
                },
                {
                  key: 'observed',
                  label: 'Observed',
                },
              ]}
              rows={s.impactPlan.metrics.map((m) => ({
                id: m.id,
                cells: {
                  metric: `${m.name} (${m.unit})`,
                  baseline: m.baseline,
                  target: m.target,
                  observed: report?.observations.find((o) => o.metricId === m.id)?.value ?? 'Unmeasured',
                },
              }))}
            />
            {report && (
              <div className="space-y-3">
                <StatusPill className="text-fg-heading" tone={report.state === 'reviewed' ? 'success' : 'info'}>{report.state}</StatusPill>
                <p className="whitespace-pre-wrap">{report.narrative}</p>
                {report.observations.map((o) => (
                  <p key={o.metricId} className="text-sm">
                    {s.impactPlan?.metrics.find((metric) => metric.id === o.metricId)?.name ?? 'Retired metric'}: {o.value === null ? 'Unmeasured' : o.value} / {o.evidence || 'No measurement evidence'} / {o.method}
                  </p>
                ))}
                {report.review && <p>Review: {report.review}</p>}
              </div>
            )}
            {!data.staff &&
              data.writer &&
              !['submitted', 'reviewed'].includes(report?.state || '') &&
              form(
                'save_impact',
                'Save impact update',
                {
                  day,
                  observations: s.impactPlan.metrics.map(
                    (m) =>
                      report?.observations.find((o) => o.metricId === m.id) || {
                        metricId: m.id,
                        value: null,
                        evidence: '',
                        method: m.method,
                      },
                  ),
                  narrative: report?.narrative || '',
                  submit: false,
                },
                [
                  ...s.impactPlan.metrics.flatMap((m, i): GrantField[] => [
                    {
                      path: `observations.${i}.value`,
                      label: `${m.name}: observed (${m.unit}) / blank means unmeasured`,
                      type: 'number',
                      optional: true,
                    },
                    {
                      path: `observations.${i}.evidence`,
                      label: `${m.name}: evidence reference`,
                      optional: true,
                    },
                    {
                      path: `observations.${i}.method`,
                      label: `${m.name}: measurement method`,
                      type: 'textarea',
                      optional: true,
                    },
                  ]),
                  {
                    path: 'narrative',
                    label: 'What changed, what did not, and lessons',
                    type: 'textarea',
                  },
                  {
                    path: 'submit',
                    label: 'Submit this update for review. Leave unchecked to save a draft.',
                    type: 'checkbox',
                  },
                ],
              )}
            {capabilities?.review &&
              report?.state === 'submitted' &&
              form(
                'review_impact',
                'Record impact review',
                {
                  impactId: report.id,
                  state: 'reviewed',
                  review: '',
                },
                [
                  {
                    path: 'state',
                    label: 'Review outcome',
                    type: 'select',
                    options: options('reviewed', 'clarification'),
                  },
                  {
                    path: 'review',
                    label: 'Evidence basis and findings shared with applicant',
                    type: 'textarea',
                  },
                ],
              )}
            {capabilities?.review &&
              form(
                'close_impact',
                'Record supported close-out',
                {
                  note: '',
                },
                [
                  {
                    ...note,
                    label: 'Supported outcome narrative',
                  },
                ],
                true,
              )}
          </>
        ) : capabilities?.review && accepted && (!milestoneFirst || s.status === 'approved') ? (
          form(
            'set_impact_plan',
            'Save monitoring plan',
            {
              ownerId: data.userId,
              metrics: [
                {
                  id: 'metric-1',
                  name: '',
                  unit: '',
                  baseline: 0,
                  target: 0,
                  method: '',
                },
              ],
            },
            [ownerField],
            false,
            [metricRepeater],
          )
        ) : (
          <EmptyState title="No monitoring plan yet">A project-specific plan is recorded after accepted delivery.</EmptyState>
        )}
      </div>
    )
  } else if (tab === 'History' && !data.staff) {
    const history = [
      ...s.applications.map((app, i) => ({ at: app.at, label: i === 0 ? 'Application submitted' : 'Application response recorded' })),
      ...s.statusReleases.map((release) => ({ at: release.at, label: applicationStatusCopy[release.status].label })),
      ...s.requests.flatMap((request) => [
        { at: request.at, label: `Request received: ${request.title}` },
        ...(request.answeredAt ? [{ at: request.answeredAt, label: `Reply sent: ${request.title}` }] : []),
      ]),
      ...(clearedAt ? [{ at: clearedAt, label: 'Milestone cleared' }] : []),
      ...s.deliveries.flatMap((delivery) => [
        { at: delivery.at, label: 'Milestone evidence submitted' },
        ...(delivery.review ? [{ at: delivery.review.at, label: delivery.state === 'accepted' ? 'Milestone verified' : 'Evidence changes requested' }] : []),
      ]),
      ...s.decisions.map((decision) => ({
        at: decision.at, label: milestoneFirst && decision.outcome === 'approved' ? 'Award issued' : applicationStatusCopy[decision.outcome].label,
      })),
      ...s.terms.flatMap((term) => term.confirmedAt ? [{ at: term.confirmedAt, label: 'Award terms confirmed' }] : []),
      ...s.amendments.map((amendment) => ({ at: amendment.at, label: 'Award terms change proposed' })),
      ...(data.state.withdrawnAt ? [{ at: data.state.withdrawnAt, label: 'Application withdrawn' }] : []),
      ...(s.closedAt ? [{ at: s.closedAt, label: 'Grant marked complete' }] : []),
    ].sort((first, second) => second.at.localeCompare(first.at))
    content = (
      <SectionCard title="Application history" className="max-w-4xl">
        {history.length === 0 ? <p>No submission has been recorded.</p> : (
          <ol className="divide-y divide-line">
            {history.map(({ at, label }, index) => (
              <li key={`${at}:${index}`} className="flex flex-wrap justify-between gap-x-5 py-3">
                <span className="wrap-anywhere">{label}</span>
                <time dateTime={at} className="text-sm text-fg-muted">{at.slice(0, 10)} (UTC)</time>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    )
  } else if (tab === 'History')
    content = (
      <div className="space-y-5">
        <h2 className="text-lg">Application history</h2>
        {s.applications.map((a, i) => (
          <div key={a.id} className="border-b border-line py-4">
            <h3>Application v{i + 1}</h3>
            <p className="text-sm text-fg-muted">
              {a.at.slice(0, 10)} · {(a.answers.intakeVersion === 2 ? a.answers.milestone?.title : a.answers.terms.title) || 'Project version captured'}
            </p>
          </div>
        ))}
        {!data.staff && s.statusReleases.map((release) => (
          <p key={release.id} className="text-sm text-fg-muted">
            <time dateTime={release.at}>{release.at.slice(0, 10)}</time> / {applicationStatusCopy[release.status].label}
          </p>
        ))}
        {internal?.events.map((e) => (
          <p key={e.id} className="text-sm text-fg-muted">
            {e.at} / {e.kind.replaceAll('_', ' ')} / {e.note}
          </p>
        ))}
        {!s.applications.length && <p className="text-sm text-fg-muted">No submission has been recorded.</p>}
      </div>
    )
  const jumpClass = 'inline-flex min-h-11 items-center underline underline-offset-4'
  const recentEvents = oneCase ? internal?.events.slice(-5).reverse() ?? [] : []

  return (
    <div className={data.staff ? 'min-w-0' : 'container-page py-10'}>
      <BackLink href={data.staff ? '/admin/grants' : '/grants/applications'}>{data.staff ? 'Review queue' : 'All applications'}</BackLink>
      <PageHeader title={data.name} description={data.continuous ? "Mini Grants" : `Mini Grants / ${data.round}`}>
        {!data.staff && data.writer && s.status === 'submitted' && !s.closedAt && (
          form('withdraw_application', 'Withdraw application', { confirm: false },
            [{ path: 'confirm', label: 'Withdraw this application from consideration.', type: 'checkbox' }], true)
        )}
        {capabilities?.decide && s.status === 'submitted' && form(
          'release_review_status',
          'Release application status',
          { status: '' },
          [{
            path: 'status',
            label: 'Status to show the applicant',
            hint: 'The applicant can see this status immediately after you release it.',
            type: 'select',
            options: reviewStatus.options.filter((status) => status !== publicStatus.status)
              .map((value) => ({ value, label: applicationStatusCopy[value].label })),
          }],
          true,
        )}
      </PageHeader>
      {data.staff && <div className="mb-5 flex flex-wrap items-center gap-3">
        {!staffMilestoneDecision && displayedAmount != null && <span className="text-xl">
          {usd(displayedAmount)} {s.status === 'approved' ? 'approved' : 'requested'}
        </span>}
        {maturity && <StatusPill className="text-fg-heading" tone="neutral">Project stage {maturity.label}</StatusPill>}
        <StatusPill className="text-fg-heading" tone={s.status === 'approved' ? 'success' : 'info'}>{statusCopy.label}</StatusPill>
        {publicStatus.updateRequested && <StatusPill className="text-fg-heading" tone="warning">Update requested</StatusPill>}
        {!staffMilestoneDecision && s.status === 'approved' && <StatusPill className="text-fg-heading" tone={workflowTone}>{workflowLabel}</StatusPill>}
      </div>}
      {data.staff && !data.continuous && <div className="mb-4"><RoundIntakeStatus open={data.roundOpen} /></div>}
      {!oneCase && (
        <>
          {data.staff && milestoneFirst && <Link href={base} className={`${jumpClass} mb-2`}>Case overview</Link>}
          <GrantTabs base={base} active={applicantTabs.includes(tab) || data.staff ? tab : 'Application details'} items={data.staff ? tabs : applicantTabs} wrap />
        </>
      )}
      {s.closedAt && !applicantOverview && (
        <p className="mb-6 rounded-lg border border-line p-4 text-sm">
          Outcome close-out recorded {s.closedAt.slice(0, 10)}. History remains available.
        </p>
      )}
      {oneCase ? (
        <StaffCaseTabs key={data.id} panels={{
          'case-decision': caseDecision,
          'case-application': (
            <div className="max-w-4xl space-y-2">
              {shortRequest}
              <Link href={`${base}?tab=Application`} className={jumpClass}>Read the full application</Link>
            </div>
          ),
          'case-requests': caseRequests,
          'case-evidence': caseEvidence,
          'case-assessment': <SectionCard>{caseAssessment}</SectionCard>,
          'case-activity': (
            <SectionCard title="Recent activity" className="space-y-3">
              {recentEvents.length > 0 ? (
                <ol className="divide-y divide-line">
                  {recentEvents.map((event) => (
                    <li key={event.id} className="flex flex-wrap justify-between gap-x-5 py-2 text-sm">
                      <span>{recentActivityLabels.get(event.kind) ?? 'Case updated'}</span>
                      <time dateTime={event.at} className="text-fg-muted">{event.at.slice(0, 10)} (UTC)</time>
                    </li>
                  ))}
                </ol>
              ) : <p>No activity recorded yet.</p>}
              <nav aria-label="More case records" className="flex flex-wrap gap-x-5">
                {['History', 'Follow-ups', 'Amendments', 'Payments', 'Impact'].map((section) => (
                  <Link key={section} href={`${base}?tab=${section}`} className={jumpClass}>{section === 'History' ? 'Full history' : section}</Link>
                ))}
              </nav>
            </SectionCard>
          ),
        }} />
      ) : content}
    </div>
  )
}
