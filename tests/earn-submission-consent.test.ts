import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
const submitStage = vi.hoisted(() => vi.fn())

vi.mock('react', async (original) => {
  function slot<T>(initial: () => T) {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = initial()
    return index
  }
  return {
    ...await original<typeof import('react')>(),
    useState<T>(initial: T | (() => T)) {
      const index = slot(() => typeof initial === 'function' ? (initial as () => T)() : initial)
      return [hooks.slots[index] as T, (next: T | ((current: T) => T)) => {
        hooks.slots[index] = typeof next === 'function' ? (next as (current: T) => T)(hooks.slots[index] as T) : next
      }] as const
    },
    useRef<T>(initial: T) {
      return hooks.slots[slot(() => ({ current: initial }))] as { current: T }
    },
  }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/hooks/use-action-toast', () => ({ useActionToast: () => ({ pending: false, run: async (write: () => Promise<unknown>) => write() }) }))
vi.mock('@/app/(site)/earn/_lib/workflow-actions', () => ({ submitStage, reviseStage: vi.fn() }))

import { SubmissionForm } from '@/app/(site)/earn/_components/submission-form'

type FixtureEvent = { preventDefault: () => void; currentTarget: object }
type FixtureProps = {
  id?: string
  checked?: boolean
  children?: ReactNode
  onCheckedChange?: (checked: boolean) => void
  onSubmit?: (event: FixtureEvent) => Promise<void>
}

function findElement(node: ReactNode, matches: (element: ReactElement<FixtureProps>) => boolean): ReactElement<FixtureProps> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, matches)
      if (match) return match
    }
  }
  if (!isValidElement<FixtureProps>(node)) return
  return matches(node) ? node : findElement(node.props.children, matches)
}

// Call the real component's checkbox and form handlers with persistent hook slots.
// Only DOM inputs, navigation, and the server-action boundary are synthetic.
function visibleForm(termsVersion: number) {
  hooks.cursor = 0
  const form = SubmissionForm({
    bountyId: '83a2f90c-8226-400c-8df0-19fe4827db49',
    stageId: '4f1a1aff-0e83-47df-b238-58c04948beac',
    requiresPullRequest: false,
    githubIssueUrl: null,
    terms: `Synthetic existing additional terms, version ${termsVersion}`,
    termsVersion,
  })
  const checkbox = findElement(form, (element) => element.props.id === 'earn-terms')
  const label = findElement(form, (element) => element.type === 'summary')
  const submit = findElement(form, (element) => element.type === 'form')?.props.onSubmit
  if (!checkbox?.props.onCheckedChange || !label || !submit) throw new Error('Submission form consent controls are unavailable')
  expect(Children.toArray(label.props.children).join('')).toContain(`version ${termsVersion}`)
  return {
    checked: checkbox.props.checked,
    check: () => checkbox.props.onCheckedChange?.(true),
    submit: () => submit({ preventDefault: vi.fn(), currentTarget: {} }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  hooks.slots.length = 0
  const fields = new FormData()
  fields.set('notes', 'Synthetic contributor work')
  vi.stubGlobal('FormData', class {
    get(name: string) { return fields.get(name) }
  })
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  submitStage.mockResolvedValue({ ok: true, data: { id: 'synthetic-receipt' } })
})

afterEach(() => vi.unstubAllGlobals())

it('US-09 submits a checked consent on the same visible terms version', async () => {
  visibleForm(3).check()
  const checked = visibleForm(3)
  expect(checked.checked).toBe(true)
  await checked.submit()
  expect(submitStage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    evidence: expect.objectContaining({ accepted: true, termsVersion: 3 }),
  }))
})

it('US-09 requires a fresh check when the visible terms version advances', async () => {
  visibleForm(3).check()
  expect(visibleForm(3).checked).toBe(true)

  const refreshed = visibleForm(4)
  expect.soft(refreshed.checked, 'version 4 must show an unchecked checkbox').toBe(false)
  await refreshed.submit()
  expect.soft(submitStage.mock.calls, 'residual version 3 consent must never submit version 4').toEqual([])

  submitStage.mockClear()
  visibleForm(4).check()
  const checkedAgain = visibleForm(4)
  expect(checkedAgain.checked).toBe(true)
  await checkedAgain.submit()
  expect(submitStage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    evidence: expect.objectContaining({ accepted: true, termsVersion: 4 }),
  }))
})
