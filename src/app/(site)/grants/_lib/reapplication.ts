import 'server-only'
import type { Prisma } from '@prisma/client'
import { ActionError } from '@/lib/action-error'
import { stateSchema, type GrantState, type IntakeAnswers } from './schemas'

const waitingPeriodMs = 90 * 24 * 60 * 60 * 1000
const utcDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, timeZone: 'UTC',
})

export const formatReapplicationDate = (date: Date) => `${utcDate.format(date)} UTC`
export const missingScopeChange = 'Add a different working demo to your project, or choose a different roadmap milestone with a substantially different deliverable and verification criterion.'
export const priorDecisionUnverified = 'The previous decision could not be verified. Contact the Grants Committee about reapplying.'
export const existingGrant = 'This project already has an existing grant application or award. Open All applications to review it.'

type PriorRejection = {
  applicationId: string
  at: Date
  submission: GrantState['applications'][number] | undefined
}

export async function grantIntakeHistory(db: Prisma.TransactionClient, projectId: string, exceptId?: string) {
  // In this native module all GrantApplication rows belong to Mini Grants,
  // including legacy rounds. Builder Hub identities are outside this check.
  const rows = await db.grantApplication.findMany({
    where: { projectId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: {
      id: true, status: true, roundId: true, state: true,
      revisions: {
        where: { kind: 'record_decision', state: { path: ['status'], equals: 'not_selected' } },
        orderBy: { number: 'desc' },
        take: 1,
        select: { state: true },
      },
      _count: { select: { paymentReferences: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  let latest: PriorRejection | undefined
  let unverified = false
  let award = false
  for (const row of rows) {
    const head = stateSchema.safeParse(row.state)
    if (!head.success) {
      unverified = true
      continue
    }
    const state = head.data
    award ||= row.status === 'approved' || state.decisions.some(({ outcome }) => outcome === 'approved') ||
      state.terms.length > 0 || state.payments.length > 0 || row._count.paymentReferences > 0
    const receipt = stateSchema.safeParse(row.revisions[0]?.state)
    const decision = receipt.data?.decisions.at(-1)
    if (!receipt.success || decision?.outcome !== 'not_selected') {
      unverified ||= row.status === 'not_selected' || state.decisions.some(({ outcome }) => outcome === 'not_selected')
      continue
    }
    const at = new Date(decision.at)
    if (!latest || at > latest.at) latest = { applicationId: row.id, at, submission: receipt.data.applications.at(-1) }
  }
  return {
    latest, unverified, award,
    active: rows.filter(({ status }) => ['draft', 'submitted', 'deferred'].includes(status)),
    latestContinuous: rows.find(({ roundId }) => roundId === null),
  }
}

export function reapplicationEligibility(latest: PriorRejection | undefined, now: Date) {
  if (!latest) return null
  const eligibleAt = new Date(+latest.at + waitingPeriodMs)
  return { eligibleAt, waiting: now < eligibleAt }
}

export async function priorScope(db: Prisma.TransactionClient, projectId: string, rejection: PriorRejection) {
  const { submission } = rejection
  const version = submission && await db.projectVersion.findFirst({
    where: { id: submission.projectVersionId, projectId, sealedAt: { not: null } },
    select: { demoLinks: true },
  })
  if (!submission || !version) throw new ActionError(priorDecisionUnverified)
  return { demoLinks: version.demoLinks, milestones: scopeMilestones(submission.answers) }
}

function scopeMilestones(answers: IntakeAnswers) {
  if (answers.intakeVersion === 3) return answers.milestones
  if (answers.intakeVersion === 2) return answers.milestone ? [answers.milestone] : []
  return [{
    source: answers.projectMilestoneId ? 'roadmap' as const : 'application' as const,
    id: answers.projectMilestoneId, title: answers.terms.title, evidence: answers.terms.acceptance,
  }]
}

function demoBase(link: string) {
  const url = URL.parse(link.trim())
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
  return url.origin + url.pathname.replace(/\/+$/, '')
}

export function hasChangedDemo(previous: string[], candidate: string[]) {
  const previousBases = new Set(previous.map(demoBase))
  return candidate.some((link) => {
    const base = demoBase(link)
    return base !== null && !previousBases.has(base)
  })
}

const scopeWords = (value: string) =>
  [...new Set(value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].sort().join(' ')
type PreviousMilestones = ReturnType<typeof scopeMilestones>

export function hasDifferentRoadmapDeliverable(previous: PreviousMilestones, candidate: { id: string; title: string }) {
  const title = scopeWords(candidate.title)
  return Boolean(title) && previous.length > 0 && previous.every((milestone) =>
    scopeWords(milestone.title) && scopeWords(milestone.evidence) &&
    scopeWords(milestone.title) !== title && (milestone.source !== 'roadmap' || milestone.id !== candidate.id))
}

export function hasChangedRoadmapScope(previous: PreviousMilestones, answers: IntakeAnswers) {
  if (answers.intakeVersion !== 3) return false
  return answers.milestones.some((milestone) => {
    if (milestone.source !== 'roadmap' || !hasDifferentRoadmapDeliverable(previous, milestone)) return false
    const evidence = scopeWords(milestone.evidence)
    return Boolean(evidence) && previous.every((item) => scopeWords(item.evidence) !== evidence)
  })
}
