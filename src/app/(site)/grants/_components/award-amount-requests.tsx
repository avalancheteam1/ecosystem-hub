import { SectionCard } from '@/components/section-card'
import { committeeApprovalDescription, committeeApprovalLabel, committeeVoteResult } from '../_lib/committee-policy'
import { StatusPill } from '@/components/status-pill'
import type { applicantProjection, milestonePlan } from '../_lib/rules'
import type { GrantState } from '../_lib/schemas'
import { GrantCommandForm, type GrantField } from './command-form'

type ApplicantRequest = NonNullable<ReturnType<typeof applicantProjection>['awardAmountRequest']>
type CommitteeReview = NonNullable<Extract<GrantState, { version: 4 }>['committeeReview']>
type Plan = NonNullable<ReturnType<typeof milestonePlan>>
type FormTarget = { applicationId: string; revision: number }

const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usd = (minor: number) => amount.format(minor / 100)

function Allocation({ requestedAmount, request, plan }: {
  requestedAmount: number | null
  request: ApplicantRequest
  plan: Plan
}) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-line p-4">
        <div>
          <dt className="text-sm text-fg-muted">Original request</dt>
          <dd className="mt-1 text-lg">{requestedAmount === null ? 'Unavailable' : usd(requestedAmount)}</dd>
        </div>
        <div>
          <dt className="text-sm text-fg-muted">Proposed total</dt>
          <dd className="mt-1 text-lg">{usd(request.totalMinor)}</dd>
        </div>
      </dl>
      <div className="space-y-2">
        <h3>Proposed milestone allocation</h3>
        <dl className="divide-y divide-line">
          {plan.milestones.map((milestone) => {
            const allocation = request.milestoneAmounts.find(({ milestoneId }) => milestoneId === milestone.milestoneId)
            return (
              <div key={milestone.milestoneId} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <dt className="min-w-0 wrap-anywhere">{milestone.title}</dt>
                <dd className="font-medium">{allocation ? usd(allocation.amountMinor) : 'Unavailable'}</dd>
              </div>
            )
          })}
        </dl>
      </div>
      <div>
        <h3 className="mb-1 text-sm text-fg-muted">Reason for the proposal</h3>
        <p className="wrap-anywhere whitespace-pre-wrap">{request.reason}</p>
      </div>
    </>
  )
}

function AmountResponse({ response, pending }: { response?: ApplicantRequest['response']; pending: boolean }) {
  if (!response) return <StatusPill tone={pending ? 'warning' : 'neutral'}>{pending ? 'Awaiting applicant response' : 'No response recorded'}</StatusPill>
  const accepted = response.outcome === 'accepted'
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={accepted ? 'success' : 'neutral'}>{accepted ? 'Accepted by applicant' : 'Declined by applicant'}</StatusPill>
        <time dateTime={response.at} className="text-sm text-fg-muted">{response.at.slice(0, 10)} (UTC)</time>
      </div>
      {response.note && <p className="wrap-anywhere whitespace-pre-wrap">{response.note}</p>}
    </div>
  )
}

export function ApplicantAwardAmountRequest({ request, plan, requestedAmount, open, writer, formTarget }: {
  request: ApplicantRequest
  plan: Plan
  requestedAmount: number | null
  open: boolean
  writer: boolean
  formTarget: FormTarget
}) {
  const pending = open && !request.response
  return (
    <SectionCard title="Proposed award amount" className="space-y-4">
      <AmountResponse response={request.response} pending={pending} />
      <Allocation request={request} plan={plan} requestedAmount={requestedAmount} />
      {pending && (
        <>
          <p className="text-sm text-fg-muted">Accepting records your agreement to this total and milestone split. The award still needs approval.</p>
          {writer ? (
            <GrantCommandForm key={`${formTarget.revision}:${request.id}`} {...formTarget} label="Respond to proposed amount"
              data={{ kind: 'respond_award_amount', requestId: request.id, outcome: '' }}
              fields={[
                { path: 'outcome', label: 'Your response', type: 'select', options: [
                  { value: 'accepted', label: 'Accept the proposed amount' },
                  { value: 'declined', label: 'Decline the proposed amount' },
                ] },
              ]}
              dialog outcomeSubmitLabels={{ accepted: 'Accept this amount', declined: 'Decline this amount' }} recoverUnknownResult />
          ) : <p className="text-sm text-fg-muted">A project owner or editor can respond to this proposal.</p>}
        </>
      )}
    </SectionCard>
  )
}

export function StaffAwardAmountRequests({ review, plan, requestedAmount, open, canPropose, canVote, planVerified, openQuestions, formTarget, viewerId }: {
  review?: CommitteeReview
  plan: Plan
  requestedAmount: number | null
  open: boolean
  canPropose: boolean
  canVote: boolean
  planVerified: boolean
  openQuestions: boolean
  formTarget: FormTarget
  viewerId: string
}) {
  const latest = review?.requests.at(-1)
  const mayPropose = open && canPropose && review?.shortlist.planId === plan.id && requestedAmount !== null
  const defaultAllocation = latest?.planId === plan.id ? latest : undefined
  const amountFields: GrantField[] = plan.milestones.map((milestone, index) => ({
    path: `milestoneAmounts.${index}.amountMinor`, label: `${milestone.title} (USD)`, type: 'money', minimumMinor: 0,
  }))
  return (
    <SectionCard title="Award amount proposals" className="space-y-5">
      {mayPropose && (
        <GrantCommandForm key={formTarget.revision} {...formTarget}
          label={latest ? 'Propose a new version' : 'Propose an award amount'}
          data={{
            kind: 'request_award_amount', planId: plan.id, totalMinor: defaultAllocation?.totalMinor ?? requestedAmount,
            milestoneAmounts: plan.milestones.map(({ milestoneId }) => ({
              milestoneId, amountMinor: defaultAllocation?.milestoneAmounts.find((item) => item.milestoneId === milestoneId)?.amountMinor
                ?? (plan.milestones.length === 1 ? requestedAmount : null),
            })), reason: '',
          }}
          fields={[
            { path: 'totalMinor', label: 'Proposed total (USD)', type: 'money', minimumMinor: 1,
              hint: `Use up to ${usd(requestedAmount)}. You can keep the original total and propose a milestone split.` },
            ...amountFields,
            { path: 'reason', label: 'Reason shared with the applicant', type: 'textarea',
              hint: 'Use $0 for unfunded milestones. The allocations must add up to the total. The applicant will see this version in Requests.' },
          ]}
          dialog recoverUnknownResult />
      )}
      {mayPropose && latest && <p className="text-sm text-fg-muted">Each new version requires a fresh applicant response and fresh Committee votes.</p>}
      {!latest && <p className="text-sm text-fg-muted">No award amount proposal recorded.</p>}
      {review?.requests.toReversed().map((request, index) => {
        const current = request.id === latest?.id
        const tally = committeeVoteResult(review.shortlist, request)
        const mayVote = current && open && canVote && planVerified && !openQuestions &&
          request.planId === plan.id && request.response?.outcome === 'accepted'
        const myVote = request.votes.findLast((vote) => vote.actorId === viewerId)?.vote
        return (
          <section key={request.id} className="space-y-4 border-t border-line pt-5">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3>Award amount proposal v{review.requests.length - index}</h3>
                <p className="mt-1 text-sm text-fg-muted">Proposed <time dateTime={request.at}>{request.at.slice(0, 10)} (UTC)</time></p>
              </div>
              {!current && <StatusPill>Superseded</StatusPill>}
              {review.issuedRequestId === request.id && <StatusPill tone="success">Used for issued award</StatusPill>}
            </header>
            <AmountResponse response={request.response} pending={current && open} />
            {request.planId === plan.id
              ? <Allocation request={request} plan={plan} requestedAmount={requestedAmount} />
              : <p><strong>{usd(request.totalMinor)}</strong> proposed for a prior plan.</p>}
            <div className="space-y-2 rounded-lg border border-line p-4">
              <h4>Internal Committee vote · {committeeApprovalLabel[tally.rule]}</h4>
              <p className="text-sm text-fg-muted">{committeeApprovalDescription[tally.rule]}</p>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <StatusPill tone={tally.passed ? 'success' : 'neutral'}>{tally.approved} of {tally.total} approvals</StatusPill>
                <span className="text-fg-muted">{tally.opposed} opposed · {tally.abstained} abstained · {tally.outstanding} without a vote</span>
              </div>
              {myVote && <p className="text-sm">{myVote === 'abstain' ? 'You abstained on this version.'
                : `Your vote ${myVote === 'approve' ? 'approved' : 'opposed'} this version.`}</p>}
              {current && open && (request.response?.outcome !== 'accepted' || !planVerified || openQuestions) && (
                <p className="text-sm text-fg-muted">Voting opens after the applicant accepts this version, all milestones are verified, and all clarification requests are resolved.</p>
              )}
              {mayVote && (
                <GrantCommandForm key={`${formTarget.revision}:${request.id}`} {...formTarget}
                  label={myVote ? 'Update your Committee vote' : 'Record Committee vote'}
                  data={{ kind: 'vote_award', requestId: request.id, vote: '', note: '' }}
                  fields={[
                    { path: 'vote', label: 'Vote on this version', type: 'select', options: [
                      { value: 'approve', label: 'Approve' }, { value: 'oppose', label: 'Oppose' }, { value: 'abstain', label: 'Abstain' },
                    ] },
                    { path: 'note', label: 'Staff-only reason', type: 'textarea' },
                  ]}
                  dialog recoverUnknownResult />
              )}
            </div>
          </section>
        )
      })}
    </SectionCard>
  )
}
