import { beforeEach, expect, test, vi } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

const state = vi.hoisted(() => ({ draft: '', setDraft: vi.fn() }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: () => [state.draft, state.setDraft],
}))
import { ValueListInput } from '@/components/list-inputs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { projectLinkError } from '@/app/(app)/projects/_lib/schemas'

function find(node: unknown, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean)
  if (!isValidElement<Record<string, unknown>>(node)) return undefined
  return node.type === type ? node : find(node.props.children, type)
}
beforeEach(() => state.setDraft.mockClear())

for (const kind of ['githubRepos', 'demoLinks'] as const) {
  test.each(['blur', 'Enter', 'Add'])(`G4: invalid ${kind} cannot commit on %s`, (trigger) => {
    state.draft = 'ftp://example.test'
    const onChange = vi.fn()
    const tree = ValueListInput({ id: kind, value: [], onChange, placeholder: '', validate: (value) => projectLinkError(kind, value) })
    const input = find(tree, Input)!
    const button = find(tree, Button)!
    expect(input.props['aria-invalid']).toBe(true)
    expect(input.props['aria-describedby']).toBe(`${kind}-error`)
    if (trigger === 'blur') (input.props.onBlur as () => void)()
    else if (trigger === 'Add') (button.props.onClick as () => void)()
    else (input.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', preventDefault: vi.fn() })
    expect(onChange).not.toHaveBeenCalled()
    expect(state.setDraft).not.toHaveBeenCalled()
  })
}
test('G4: valid list entry commits and clears the pending value', () => {
  state.draft = 'https://example.test/app'
  const onChange = vi.fn()
  const tree = ValueListInput({ id: 'demo', value: [], onChange, placeholder: '', validate: (value) => projectLinkError('demoLinks', value) })
  ;(find(tree, Input)!.props.onBlur as () => void)()
  expect(onChange).toHaveBeenCalledWith(['https://example.test/app'])
  expect(state.setDraft).toHaveBeenCalledWith('')
})
