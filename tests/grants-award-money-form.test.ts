import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GrantCommandForm } from '@/app/(site)/grants/_components/command-form'

const { changeApplication, dialog } = vi.hoisted(() => ({
  changeApplication: vi.fn().mockResolvedValue({ ok: true, data: { revision: 2 } }),
  dialog: { submit: null as (() => Promise<unknown>) | null },
}))
vi.mock('@/app/(site)/grants/_lib/actions', () => ({ changeApplication, createApplication: vi.fn() }))
vi.mock('@/hooks/use-action-toast', () => ({
  useActionToast: () => ({ pending: false, run: async (action: () => Promise<unknown>) => action() }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/grants/applications/case-1',
  useRouter: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/form-dialog', () => ({
  FormDialog: ({ children, onSubmit }: { children: ReactNode; onSubmit: () => Promise<unknown> }) => {
    dialog.submit = onSubmit
    return children
  },
}))

describe('Grant command form USD amounts', () => {
  beforeEach(() => {
    changeApplication.mockClear()
    dialog.submit = null
  })

  it.each([
    { totalMinor: 480000, allocations: [479995, 5, 0], dollars: ['4800.00', '4799.95', '0.05', '0.00'] },
    { totalMinor: 1, allocations: [1, 0, 0], dollars: ['0.01', '0.00'] },
  ])('preserves the total of $totalMinor minor units and each allocation exactly', async ({ totalMinor, allocations, dollars }) => {
    const data = {
      kind: 'request_award_amount', planId: 'plan-1', totalMinor, reason: 'Break down the total',
      milestoneAmounts: allocations.map((amountMinor, index) => ({ milestoneId: `milestone-${index + 1}`, amountMinor })),
    }
    const html = renderToStaticMarkup(createElement(GrantCommandForm, {
      applicationId: 'case-1', revision: 1, label: 'Propose an award amount', data, dialog: true,
      fields: [
        { path: 'totalMinor', type: 'money', minimumMinor: 1, label: 'Proposed total (USD)' },
        ...data.milestoneAmounts.map((_, index) => ({
          path: `milestoneAmounts.${index}.amountMinor`, type: 'money' as const, minimumMinor: 0 as const, label: `Milestone ${index + 1} (USD)`,
        })),
        { path: 'reason', type: 'textarea', label: 'Reason' },
      ],
    }))
    for (const value of dollars) expect(html).toContain(`value="${value}"`)
    await dialog.submit?.()
    expect(changeApplication).toHaveBeenCalledOnce()
    expect(changeApplication).toHaveBeenCalledWith({ applicationId: 'case-1', revision: 1, command: data })
  })

  it('labels required, optional and conditional fields using the command form metadata', () => {
    const html = renderToStaticMarkup(createElement(GrantCommandForm, {
      applicationId: 'case-1', revision: 1, label: 'Review delivery evidence', dialog: true,
      data: { kind: 'review_delivery', outcome: 'changes_requested', inspected: false },
      fields: [
        { path: 'note', type: 'textarea', label: 'Note for the applicant' },
        { path: 'extra', label: 'Supporting link', optional: true },
        { path: 'inspected', type: 'checkbox', label: 'Agreed output inspected', requirement: 'required to verify' },
      ],
    }))
    expect(html).toMatch(/Note for the applicant<span[^>]*> \(required\)/)
    expect(html).toMatch(/Supporting link<span[^>]*> \(optional\)/)
    expect(html).toMatch(/Agreed output inspected<span[^>]*> \(required to verify\)/)
  })

  it('keeps the dollar minimum for existing required money fields', async () => {
    renderToStaticMarkup(createElement(GrantCommandForm, {
      applicationId: 'case-1', revision: 1, label: 'Record payment', dialog: true,
      data: { kind: 'report_payment', reference: 'synthetic-payment', amountMinor: 5, date: '2026-11-26',
        evidence: 'https://example.test/receipt', note: 'Receipt' },
      fields: [{ path: 'amountMinor', type: 'money', label: 'Payment amount (USD)' }],
    }))
    await dialog.submit?.()
    expect(changeApplication).not.toHaveBeenCalled()
  })
})
