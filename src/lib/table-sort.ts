/** Sort comparator shared by `DataTable` (client) and pages that sort before paging (server). Empty values last, whatever the direction. */
export function compareSortValues(a: unknown, b: unknown, dir: 'asc' | 'desc'): number {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1
  if (b == null || b === '') return -1
  const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  return dir === 'asc' ? c : -c
}
