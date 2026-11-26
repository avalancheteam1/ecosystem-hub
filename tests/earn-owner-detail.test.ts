import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

type GetOwnReceipt = typeof import('@/app/(site)/earn/_lib/workflow-queries').getOwnReceipt
type ReceiptStatus = NonNullable<Awaited<ReturnType<GetOwnReceipt>>>['status']

const getOwnReceipt = vi.hoisted(() => vi.fn<GetOwnReceipt>())
vi.mock('@/app/(site)/earn/_lib/workflow-queries', () => ({ getOwnReceipt }))
vi.mock('@/app/(site)/earn/_lib/workflow-actions', () => ({ reviseStage: vi.fn(), submitStage: vi.fn(), withdrawStage: vi.fn() }))
vi.mock('next/navigation', async (original) => ({
  ...await original<typeof import('next/navigation')>(),
  useRouter: () => ({ refresh: vi.fn() }),
}))

import ReceiptPage from '@/app/(site)/earn/[id]/receipts/[entryId]/page'

const id = '83a2f90c-8226-400c-8df0-19fe4827db49'
const entryId = '17f149fa-6932-4c27-85f5-096379ba4db6'
const notes = 'Original synthetic submission evidence'
const revision = {
  number: 2, notes, links: ['https://work.example.test/outline'], pullRequests: [], changeNote: 'Older synthetic change',
  termsVersion: 3, acceptedAt: new Date('2026-11-24T12:00Z'), withdrawnAt: null, withdrawalReason: null,
}

async function detail(status: ReceiptStatus, version: number) {
  const stage = { id: '4f1a1aff-0e83-47df-b238-58c04948beac', position: 2, title: 'Synthetic final' }
  const createdAt = new Date('2026-11-23T12:00Z')
  getOwnReceipt.mockResolvedValueOnce({
    id: entryId, status, version, revision: 2, final: true, stageApproved: false, award: null, hasMore: false,
    createdAt, lineage: [{ id: entryId, revision: 2, createdAt, stage }],
    canRevise: status !== 'rejected', canWithdraw: true,
    previousSubmissionId: null, revisions: [revision], reviews: [],
    stage: {
      ...stage, submissionPolicy: 'multiple',
      requiresPullRequest: false,
      bounty: {
        title: 'Synthetic bounty', terms: 'Synthetic additional terms', termsVersion: 3, githubIssueUrl: null,
        deadline: new Date(Date.now() + 60_000), cancelledAt: null, resultsAnnouncedAt: null,
        _count: { stages: 2 },
      },
    },
  })
  return renderToStaticMarkup(await ReceiptPage({ params: Promise.resolve({ id, entryId }), searchParams: Promise.resolve({}) }))
}

it('US-04 offers Edit and Withdraw for changes requested while keeping the owner detail read-only', async () => {
  const html = await detail('changes_requested', 4)
  expect(html).toContain('Changes requested')
  expect(html).toContain(notes)
  expect(html).toContain('Withdraw submission')
  expect.soft(/>\s*Edit(?: submission)?\s*<\/(?:a|button)>/.test(html), 'explicit Edit control').toBe(true)
  expect(html.includes('What changed?'), 'revision form visible by default').toBe(false)
})

it('US-05 keeps existing revision evidence readable for historical rows with no parent', async () => {
  const html = await detail('rejected', 4)
  expect(html).toContain('Revision 2')
  expect(html).toContain(notes)
  expect(html).toContain('Older synthetic change')
  expect(html).toContain('https://work.example.test/outline')
})

it('US-06 keeps contributor status, evidence and allowed actions stable on a private selection', async () => {
  const inReview = await detail('pending', 4)
  const selected = await detail('approved', 5)
  for (const html of [inReview, selected]) {
    expect(html).toContain('In review')
    expect(html).toContain(notes)
  }
  expect(inReview).toContain('Withdraw submission')
  expect(selected.includes('Withdraw submission'), 'private selection changed the withdrawal control').toBe(true)
})
