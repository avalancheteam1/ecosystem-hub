import { expect, test } from 'vitest'
import { csv, submissionExportRows, notSubmittedExportRows } from '@/app/(site)/events/_lib/hackathons/csv'

test('[US-17.4] F2: every CSV cell is quoted and spreadsheet formulas remain text', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-1+1', '@SUM(A1)', '\t=1', '\r=1', '\n=1', '  =1']) expect(csv([[value]])).toContain(`"'${value}"`)
  expect(csv([['a"b', 'one,two', null], ['line\nbreak']])).toBe('\uFEFF"a""b","one,two",""\r\n"line\nbreak"')
})

test('[US-17.2] F1/F2: sponsor selections sit next to tracks and score exports declare the raw scale', () => {
  const rows = submissionExportRows({ tracks: [{ id: 't', name: 'Track' }], sponsorPrizes: [{ id: 'p', sponsor: 'Sponsor', name: '=Prize' }], stages: [{ name: 'Rome', scaleMin: 1, scaleMax: 5 }] }, [{ name: 'Project', status: 'active', trackIds: ['t'], sponsorPrizeIds: ['p'], team: [{ name: 'Builder', email: 'builder@example.test' }], stages: [[1, 50, 1, 'no']], awards: '' }])
  expect(rows[0]!.slice(2, 4)).toEqual(['Tracks', 'Sponsor prizes'])
  expect(rows[1]!.slice(2, 4)).toEqual(['Track', 'Sponsor: =Prize'])
  expect(rows[0]).toContain('Rome score (0-100)')
  expect(rows[1]!.slice(-3)).toEqual([1, 5, ''])
})

test('[US-17.3] F2: not-submitted export labels draft and registration rows without inventing a team', () => {
  const rows = notSubmittedExportRows([{ name: '=Draft', team: ['Builder'] }], [{ status: 'pending', user: { name: 'Builder', email: '+builder@example.test' } }])
  expect(rows).toEqual([
    ['Record type', 'Project', 'Team / participant', 'Registration status', 'Email'],
    ['Saved project, never submitted', '=Draft', 'Builder', '', ''],
    ['Participant, no active submission', '', 'Builder', 'Awaiting approval', '+builder@example.test'],
  ])
  expect(csv(rows)).toContain('"\'=Draft"')
  expect(csv(rows)).toContain('"\'+builder@example.test"')
})

test.each([['active', 'Submitted'], ['withdrawn', 'Withdrawn'], ['disqualified', 'Disqualified'], ['internal_key', 'Unknown status']])('[US-17.2 US-17.4 US-18.4] Armin F1: exported status %s is a human label', (status, label) => {
  const rows = submissionExportRows({ tracks: [], sponsorPrizes: [], stages: [] }, [{ name: 'Project', status, trackIds: [], sponsorPrizeIds: [], team: [], stages: [], awards: '' }])
  expect(rows[1]?.[1]).toBe(label)
})

test('[US-17.3 US-18.4] Armin F2: export registration labels and row populations stay distinct', () => {
  const rows = notSubmittedExportRows([], ['active', 'pending', 'internal_key'].map((status) => ({ status, user: { name: 'Builder', email: 'builder@example.test' } })))
  expect(rows.slice(1).map((r) => r[3])).toEqual(['Registered', 'Awaiting approval', 'Unknown status'])
  expect(rows.slice(1).every((r) => r[0] === 'Participant, no active submission' && r[1] === '')).toBe(true)
})

test('[US-17.2 US-17.4] missing track or sponsor records never expose internal identifiers in CSV', () => {
  const rows = submissionExportRows({ tracks: [], sponsorPrizes: [], stages: [] }, [{ name: 'Project', status: 'internal_key', trackIds: ['internal-track-id'], sponsorPrizeIds: ['internal-sponsor-id'], team: [], stages: [], awards: '' }])
  expect(rows[1]!.slice(1, 4)).toEqual(['Unknown status', '', ''])
  expect(csv(rows)).not.toMatch(/internal-(?:track|sponsor)-id|internal_key/)
})
