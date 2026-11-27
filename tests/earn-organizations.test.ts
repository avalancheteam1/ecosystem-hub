import { expect, it, vi } from 'vitest'

const findOrganizations = vi.hoisted(() => vi.fn())
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ prisma: { organization: { findMany: findOrganizations } } }))

import { ORG_TYPES } from '@/lib/campus'
import { getOrgOptions } from '@/lib/organizations'

it('US-10 adds issuer types to the shared organization taxonomy', () => {
  expect(ORG_TYPES).toEqual(expect.arrayContaining(['university', 'blockchain_club', 'team1', 'chapter', 'partner']))
})

it('US-10 preserves Campus university and club choices while excluding Earn issuers', async () => {
  const rows = [
    { id: 'synthetic-university', type: 'university', name: 'Synthetic University', parentId: null },
    { id: 'synthetic-club', type: 'blockchain_club', name: 'Synthetic Club', parentId: 'synthetic-university' },
    { id: 'synthetic-team', type: 'team1', name: 'Synthetic Central', parentId: null },
    { id: 'synthetic-chapter', type: 'chapter', name: 'Synthetic Chapter', parentId: null },
    { id: 'synthetic-partner', type: 'partner', name: 'Synthetic Partner', parentId: null },
  ].map((row) => ({ ...row, aliases: [], country: null }))
  findOrganizations.mockResolvedValueOnce(rows)

  expect(await getOrgOptions(rows.map(({ id }) => id))).toEqual({
    universities: [{ id: 'synthetic-university', name: 'Synthetic University', aliases: [], country: null }],
    clubs: [{ id: 'synthetic-club', name: 'Synthetic Club', aliases: [], parentId: 'synthetic-university' }],
  })
})
