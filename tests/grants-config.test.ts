import { afterEach, describe, expect, it, vi } from 'vitest'
import { committeeRoster } from '@/app/(site)/grants/_lib/committee-config'
import { syntheticPayoutEnabled } from '@/app/(site)/grants/_lib/config'

vi.mock('server-only', () => ({}))

const fixture = 'postgresql://fixture@127.0.0.1:55527/grants_us7_test'

afterEach(() => vi.unstubAllEnvs())

describe('US-7 synthetic payout database boundary', () => {
  it.each([fixture, 'postgres://fixture:synthetic%40pass@[::1]:5432/grants_test'])('accepts a disposable loopback fixture %s', (url) => {
    vi.stubEnv('GRANTS_SYNTHETIC_PAYOUT_ENABLED', 'true')
    vi.stubEnv('DATABASE_URL', url)
    expect(syntheticPayoutEnabled(url)).toBe(true)
  })

  it.each([
    'postgresql://fixture@localhost:55527/grants_test',
    'postgresql://fixture@127.0.0.1/grants_test',
    'postgresql://fixture@127.0.0.1:0/grants_test',
    'postgresql://fixture@127.0.0.1:65536/grants_test',
    'postgresql://fixture@127.0.0.1:55527/grants',
    `postgresql://fixture@127.0.0.1:55527/${'a'.repeat(59)}_test`,
    'postgresql://fixture@127.0.0.1:55527/archive/../grants_test',
    'postgresql://fixture@127.0.0.1:55527/archive/grants_test',
    'postgresql://fixture@127.0.0.1:55527/grants%5ftest',
    'https://fixture@127.0.0.1:55527/grants_test',
    'postgresql://fixture@example.invalid:55527/grants_test',
    `${fixture}?host=example.invalid`,
    `${fixture}?h%6fst=example.invalid`,
    `${fixture}?port=5432`,
    `${fixture}?schema=public`,
    `${fixture}?`,
    `${fixture}#`,
    `${fixture}\n`,
    undefined,
  ])('rejects a URL outside the fixture contract %s', (url) => {
    vi.stubEnv('GRANTS_SYNTHETIC_PAYOUT_ENABLED', 'true')
    vi.stubEnv('DATABASE_URL', url)
    expect(syntheticPayoutEnabled(url)).toBe(false)
  })

  it('follows the client URL instead of a later environment value', () => {
    vi.stubEnv('GRANTS_SYNTHETIC_PAYOUT_ENABLED', 'true')
    vi.stubEnv('DATABASE_URL', fixture)
    expect(syntheticPayoutEnabled('postgresql://fixture@example.invalid:55527/grants_test')).toBe(false)
  })

  it('requires the opt-in even with a disposable database', () => {
    vi.stubEnv('GRANTS_SYNTHETIC_PAYOUT_ENABLED', 'false')
    expect(syntheticPayoutEnabled(fixture)).toBe(false)
  })

  it('keeps the fixture disabled in production despite the opt-in', () => {
    vi.stubEnv('GRANTS_SYNTHETIC_PAYOUT_ENABLED', 'true')
    vi.stubEnv('NODE_ENV', 'production')
    expect(syntheticPayoutEnabled(fixture)).toBe(false)
  })
})

describe('Committee roster configuration', () => {
  it('accepts different numbers of distinct Hub users and trims configured IDs', () => {
    vi.stubEnv('GRANTS_SHORTLISTER_ID', ' lead ')
    vi.stubEnv('GRANTS_COMMITTEE_MEMBER_IDS', ' a, b,c,d ')
    expect(committeeRoster()).toEqual({ shortlisterId: 'lead', memberIds: ['a', 'b', 'c', 'd'] })
    vi.stubEnv('GRANTS_COMMITTEE_MEMBER_IDS', 'a,b,c')
    expect(committeeRoster()?.memberIds).toEqual(['a', 'b', 'c'])
    vi.stubEnv('GRANTS_COMMITTEE_MEMBER_IDS', 'a,b,c,d,e')
    expect(committeeRoster()?.memberIds).toHaveLength(5)
  })

  it.each(['', 'a,a,c,d', 'lead,b,c,d', 'a,b,c,', undefined])('rejects an invalid roster %s', (ids) => {
    vi.stubEnv('GRANTS_SHORTLISTER_ID', 'lead')
    vi.stubEnv('GRANTS_COMMITTEE_MEMBER_IDS', ids)
    expect(committeeRoster()).toBeNull()
  })

  it('needs a designated shortlister', () => {
    vi.stubEnv('GRANTS_SHORTLISTER_ID', undefined)
    vi.stubEnv('GRANTS_COMMITTEE_MEMBER_IDS', 'a,b,c,d')
    expect(committeeRoster()).toBeNull()
  })
})
