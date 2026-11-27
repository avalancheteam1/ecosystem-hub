// @vitest-environment jsdom
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { test, vi } from 'vitest'
import { SearchSelect } from '@/components/search-select'

test('selecting a filtered option starts the next picker session with all options', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  try {
    const options = [{ value: 'DE', label: 'Germany' }, { value: 'FR', label: 'France' }]
    let selected = ''
    await act(() => root.render(createElement(SearchSelect, { value: null, options, onChange: v => { selected = v } })))
    const trigger = host.querySelector('button')!
    await act(() => { trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })) })
    await act(() => document.querySelector<HTMLElement>('[role="option"]')!.click())
    assert.equal(selected, 'DE')
    await act(() => trigger.click())
    assert.equal(document.querySelector<HTMLInputElement>('[role="combobox"]')!.value, '')
    assert.deepEqual(Array.from(document.querySelectorAll('[role="option"]'), el => el.textContent), ['Germany', 'France'])
  } finally {
    await act(() => root.unmount())
    host.remove()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.unstubAllGlobals()
  }
})

test('onSearchChange gets the typed text and the reset on close', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  try {
    const seen: string[] = []
    const options = [{ value: 'DE', label: 'Germany' }]
    await act(() => root.render(createElement(SearchSelect, { value: null, options, onChange: () => {}, onSearchChange: t => { seen.push(t) } })))
    const trigger = host.querySelector('button')!
    await act(() => { trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })) })
    await act(() => { trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true })) })
    assert.deepEqual(seen, ['g', 'ge'])
    await act(() => document.querySelector<HTMLElement>('[role="option"]')!.click())
    assert.equal(seen.at(-1), '')
  } finally {
    await act(() => root.unmount())
    host.remove()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    vi.unstubAllGlobals()
  }
})
