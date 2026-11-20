import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

const mocks = vi.hoisted(() => ({ answers: {} as Record<string, unknown>, action: vi.fn(), run: vi.fn(), focus: vi.fn(), errors: vi.fn(), getElementById: vi.fn() }))
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(), useState: (initial: unknown) => [typeof initial === 'object' ? mocks.answers : initial, mocks.errors] }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-action-toast', () => ({ useActionToast: () => ({ pending: false, run: mocks.run }) }))
vi.mock('@/app/(site)/events/_lib/hackathons/participant-actions', () => ({ joinHackathon: mocks.action }))
import { JoinForm } from '@/app/(site)/events/[slug]/join/join-form'
import type { AnswerField } from '@/components/answer-fields'

function find(node: unknown, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean)
  if (!isValidElement<Record<string, unknown>>(node)) return undefined
  return node.type === type ? node : find(node.props.children, type)
}
const field = (type: string, required = true): AnswerField => ({ id: 'question', label: 'Participation question', type, required, options: ['A', 'B'], maxLength: 20, help: null })
async function submit(f: AnswerField) {
  const tree = JoinForm({ hackathonId: 'h', fields: [f], termsUrl: null, needsApproval: false })
  const form = find(tree, 'form')!
  await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault: vi.fn() })
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.answers = {}
  mocks.getElementById.mockReturnValue({ matches: () => true, focus: mocks.focus })
  vi.stubGlobal('document', { getElementById: mocks.getElementById })
  mocks.action.mockResolvedValue({ ok: true, data: { slug: 'synthetic' } })
  mocks.run.mockImplementation(async (run) => { await run() })
})

afterEach(() => vi.unstubAllGlobals())

test.each(['checkbox', 'multi_select', 'url', 'number'])('[US-4.2] registration %s errors stay inline and focus before invoking the action', async (type) => {
  mocks.answers = { question: type === 'url' ? 'javascript:alert(1)' : type === 'number' ? '' : undefined }
  await submit(field(type))
  expect(mocks.run).not.toHaveBeenCalled()
  expect(mocks.action).not.toHaveBeenCalled()
  expect(mocks.errors).toHaveBeenCalledWith(expect.objectContaining({ question: expect.stringMatching(/Participation question/) }))
  expect(mocks.getElementById).toHaveBeenCalledWith('ans-question')
  expect(mocks.focus).toHaveBeenCalledOnce()
})

test('[US-4.1] optional registration answer can remain blank', async () => {
  await submit(field('short_text', false))
  expect(mocks.action).toHaveBeenCalledWith(expect.objectContaining({ hackathonId: 'h', answers: {} }))
})
