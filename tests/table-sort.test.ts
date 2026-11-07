import { describe, expect, it } from 'vitest'
import { compareSortValues } from '@/lib/table-sort'

const sortBy = (vals: unknown[], dir: 'asc' | 'desc') => [...vals].sort((a, b) => compareSortValues(a, b, dir))

describe('compareSortValues', () => {
  it('sorts numbers numerically and strings naturally, case-insensitive', () => {
    expect(sortBy([10, 2, 1], 'asc')).toEqual([1, 2, 10])
    expect(sortBy(['b', 'item 10', 'A', 'item 2'], 'asc')).toEqual(['A', 'b', 'item 2', 'item 10'])
  })
  it('keeps empty values last in both directions', () => {
    expect(sortBy([null, 1, '', 2, undefined], 'asc')).toEqual([1, 2, null, '', undefined])
    expect(sortBy([null, 1, '', 2], 'desc')).toEqual([2, 1, null, ''])
  })
})
