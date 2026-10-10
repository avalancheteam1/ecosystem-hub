import { describe, expect, it } from 'vitest'
import { toggleSelection } from '@/lib/selection'

const order = ['a', 'b', 'c', 'd', 'e']

describe('toggleSelection', () => {
  it('toggles a single row', () => {
    expect(toggleSelection(order, [], 'b', null, false)).toEqual(['b'])
    expect(toggleSelection(order, ['b'], 'b', 'b', false)).toEqual([])
  })
  it('shift-click selects the range from the anchor, both directions', () => {
    expect(toggleSelection(order, ['a'], 'd', 'a', true)).toEqual(['a', 'b', 'c', 'd'])
    expect(toggleSelection(order, ['e'], 'c', 'e', true).sort()).toEqual(['c', 'd', 'e'])
  })
  it('shift-click on a selected row clears the range', () => {
    expect(toggleSelection(order, order, 'd', 'b', true)).toEqual(['a', 'e'])
  })
  it('falls back to a single toggle without a usable anchor', () => {
    expect(toggleSelection(order, [], 'c', null, true)).toEqual(['c'])
    expect(toggleSelection(order, [], 'c', 'gone', true)).toEqual(['c'])
  })
})
