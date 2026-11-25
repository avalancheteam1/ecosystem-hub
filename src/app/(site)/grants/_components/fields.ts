import anchors from '../_lib/anchors.json'
import type { GrantField } from './command-form'
import { clearanceIds, criterionIds } from '../_lib/schemas'
import { criterionNames, clearanceNames } from '../_lib/rules'

export const options = (...values: string[]) => values.map((value) => ({ value, label: value.replaceAll('_', ' ') }))
export const termsFields = (prefix = 'terms'): GrantField[] => [
  { path: `${prefix}.title`, label: 'Milestone title' },
  { path: `${prefix}.acceptance`, label: 'Deliverable and acceptance test', type: 'textarea' },
  { path: `${prefix}.amountMinor`, label: 'Amount (USD)', type: 'money' },
  { path: `${prefix}.due`, label: 'Target delivery date (UTC calendar day)', type: 'date' },
  { path: `${prefix}.maintainer`, label: 'Accountable maintainer' },
  { path: `${prefix}.verifier`, label: 'Acceptance verifier' },
  { path: `${prefix}.route`, label: 'Funding route', type: 'select', options: options('bounded_pilot', 'established_impact') },
  { path: `${prefix}.hypothesis`, label: 'Pilot hypothesis', type: 'textarea', optional: true },
  { path: `${prefix}.limits`, label: 'Risk limits', type: 'textarea', optional: true },
]
export const applicationFields: GrantField[] = [
  { path: 'answers.problem', label: 'Problem and beneficiaries', type: 'textarea' },
  { path: 'answers.outcome', label: 'What will this grant fund?', type: 'textarea', hint: 'Summarise the work and its expected benefit to Avalanche.' },
  { path: 'answers.whyGrant', label: 'Why is your project a good fit for this grant?', type: 'textarea', maxLength: 4000, hint: 'Explain why funding matters now and what it makes possible.' },
  { path: 'answers.capability', label: 'Execution capability', type: 'textarea' },
  { path: 'answers.projectMilestoneId', label: 'Project milestone', type: 'select', optional: true },
  ...termsFields('answers.terms')
    .filter((field) => !['answers.terms.title', 'answers.terms.due'].includes(field.path))
    .map((field) => field.path === 'answers.terms.amountMinor' ? { ...field, label: 'Requested amount (USD)' } : field),
  { path: 'answers.funding', label: 'Other funding and cost basis', type: 'textarea' },
  { path: 'answers.maintenance', label: 'Maintenance and measurement', type: 'textarea' },
  { path: 'answers.risks', label: 'Risks and dependencies', type: 'textarea' },
]
export const assessmentFields: GrantField[] = [
  ...criterionIds.flatMap((id, i): GrantField[] => [
    {
      path: `assessment.criteria.${id}.score`,
      label: `${id}. ${criterionNames[i]}`,
      type: 'select',
      options: options('ND', '0', '1', '2', '3'),
    },
    {
      path: `assessment.criteria.${id}.basis`,
      label: `${id} evidence basis`,
      type: 'select',
      options: [
        { value: 'E', label: 'E - supported by evidence' },
        { value: 'S', label: 'S - stated, not corroborated' },
      ],
    },
    { path: `assessment.criteria.${id}.source`, label: `${id} source`, optional: true },
    {
      path: `assessment.criteria.${id}.rationale`,
      label: `${id} rationale`,
      type: 'textarea',
      optional: true,
      hint: anchors[i].map((anchor, score) => `${score}: ${anchor}`).join(' / '),
    },
  ]),
  ...clearanceIds.flatMap((id, i): GrantField[] => [
    {
      path: `assessment.clearances.${id}.state`,
      label: clearanceNames[i],
      type: 'select',
      options: options('unresolved', 'pass', 'not_applicable'),
    },
    { path: `assessment.clearances.${id}.evidence`, label: `${clearanceNames[i]} evidence`, optional: true },
  ]),
  { path: 'assessment.note', label: 'Internal reviewer note', type: 'textarea', optional: true },
]

export const costRepeater = (prefix = 'answers.costs') => ({
  path: prefix,
  label: 'Cost item',
  limit: 30,
  template: { title: '', amountMinor: 0 },
  fields: [
    { path: 'title', label: 'Description', optional: true },
    { path: 'amountMinor', label: 'Amount (USD)', type: 'money' as const, optional: true },
  ],
})
export const metricRepeater = {
  path: 'metrics',
  label: 'Metric',
  limit: 20,
  template: { id: '', name: '', unit: '', baseline: 0, target: 0, method: '' },
  fields: [
    { path: 'id', label: 'Stable metric identifier' },
    { path: 'name', label: 'Metric name' },
    { path: 'unit', label: 'Unit' },
    { path: 'baseline', label: 'Baseline', type: 'number' as const },
    { path: 'target', label: 'Target', type: 'number' as const },
    { path: 'method', label: 'Measurement method', type: 'textarea' as const },
  ],
}
