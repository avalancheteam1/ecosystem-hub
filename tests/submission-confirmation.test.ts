import { beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { isValidElement, type ReactElement } from 'react'

const focus = vi.hoisted(() => {
  const target = { focus: vi.fn() }
  return { target, ref: { current: target as typeof target | null } }
})
const confirmState = vi.hoisted(() => ({ set: vi.fn() }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (value: unknown) => [value, value === false ? confirmState.set : vi.fn()],
  useRef: () => focus.ref,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/hooks/use-action-toast', () => ({ useActionToast: () => ({ pending: false, run: vi.fn() }) }))
vi.mock('@/app/(app)/projects/_components/project-form', () => ({ ProjectForm: () => null }))
vi.mock('@/app/(site)/events/_lib/hackathons/submission-actions', () => ({ saveHackathonDraft: vi.fn(), submitToStage: vi.fn() }))

import { SubmitForm } from '@/app/(site)/events/[slug]/submit/submit-form'
import { DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

function find(node: unknown, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean)
  if (!isValidElement<Record<string, unknown>>(node)) return undefined
  return node.type === type ? node : find(node.props.children, type)
}

function confirmation(submittedVersion: number | null, overrides: Partial<Parameters<typeof SubmitForm>[0]> = {}) {
  const tree = SubmitForm({
    inviteAction: vi.fn(), timeZone: 'Europe/Rome', hackathonName: 'Synthetic hackathon', submittedAt: null, submitPath: '/events/synthetic/submit',
    hackathonId: 'h', stageId: 's', projectId: 'p', canCreate: false,
    projects: [{ canInvite: false, id: 'p', slug: 'synthetic', name: 'Synthetic project', tagline: '', imageUrl: null,
      maturity: null, versionNumber: 1, sealed: false, members: 1, teamNames: ['Builder'], warnings: [],
      links: { video: null, repositories: [], liveApp: null, demos: [] }, submittedVersion, missing: [],
      confirmation: { versionId: 'v1', updatedAt: '2026-11-19T00:00:00.000Z', teamUserIds: ['builder'] } }],
    tracks: [], sponsorPrizes: [], initialSponsorPrizeIds: [], chooseTracks: true, initialTrackIds: [],
    fields: [], initialAnswers: {}, initialPreexisting: false, initialBuilt: '', submittedVersion,
    countries: [], defaultCountry: null,
    ...overrides,
  })
  const dialog = find(tree, DialogContent)
  assert.ok(dialog)
  assert.equal(typeof dialog.props.onCloseAutoFocus, 'function', 'Manually opened confirmation must restore focus on close')
  return { tree, close: dialog.props.onCloseAutoFocus as (event: Event) => void }
}

beforeEach(() => {
  focus.ref.current = focus.target
  focus.target.focus.mockClear()
  confirmState.set.mockClear()
})

for (const version of [null, 1]) {
  test(`[US-7.3 US-18.2] closing ${version === null ? 'new submission' : 'submission update'} confirmation restores its submit button`, () => {
    const { tree, close } = confirmation(version)
    const button = find(tree, Button)
    assert.ok(button)
    assert.equal(button.props.type, 'submit')
    assert.equal(button.props.ref, focus.ref, 'Focus target must be the form submit button')
    const event = new Event('closeAutoFocus', { cancelable: true })
    close(event)
    assert.ok(event.defaultPrevented, 'Radix must not overwrite the explicit focus target')
    assert.equal(focus.target.focus.mock.calls.length, 1)
  })
}

test('[US-7.3 US-18.2] closing confirmation after the submit button unmounts does not throw', () => {
  const { close } = confirmation(null)
  focus.ref.current = null
  assert.doesNotThrow(() => close(new Event('closeAutoFocus', { cancelable: true })))
})

test('[US-7.1] B2: a submit bubbling from a portal form cannot open confirmation', () => {
  const { tree } = confirmation(null)
  const form = find(tree, 'form')!
  const preventDefault = vi.fn()
  ;(form.props.onSubmit as (event: unknown) => void)({ target: {}, currentTarget: {}, preventDefault })
  assert.equal(preventDefault.mock.calls.length, 1)
  assert.equal(confirmState.set.mock.calls.length, 0)
})

test('[US-4.2] G1: invalid checkbox answers focus their control and never open confirmation', () => {
  const control = { matches: () => true, focus: vi.fn() }
  const getElementById = vi.fn<(id: string) => typeof control>().mockReturnValue(control)
  vi.stubGlobal('document', { getElementById })
  try {
    const { tree } = confirmation(null, { fields: [{ id: 'agreement', label: 'Agreement', type: 'checkbox', required: true, options: [], maxLength: null, help: null }] })
    const form = find(tree, 'form')!
    const target = {}
    ;(form.props.onSubmit as (event: unknown) => void)({ target, currentTarget: target, preventDefault: vi.fn() })
    assert.equal(confirmState.set.mock.calls.length, 0)
    assert.equal(getElementById.mock.calls[0]?.[0], 'ans-agreement')
    assert.equal(control.focus.mock.calls.length, 1)
  } finally { vi.unstubAllGlobals() }
})

test('[US-7.2] G1: a valid explicit submit opens confirmation', () => {
  const { tree } = confirmation(null)
  const form = find(tree, 'form')!
  const target = {}
  ;(form.props.onSubmit as (event: unknown) => void)({ target, currentTarget: target, preventDefault: vi.fn() })
  assert.equal(confirmState.set.mock.calls[0]?.[0], true)
})
