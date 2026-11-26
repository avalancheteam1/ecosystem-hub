import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '@/lib/session'

const database = process.env.GRANTS_TEST_DATABASE_URL
if (database) {
  const url = new URL(database)
  if (url.hostname !== '127.0.0.1' || !url.pathname.endsWith('_test') || url.search || url.hash)
    throw new Error('Committee invitation tests need a disposable loopback database ending in _test')
  process.env.DATABASE_URL = database
}

const { currentUser, sendMail } = vi.hoisted(() => ({ currentUser: vi.fn(), sendMail: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/session', () => ({ getCurrentUser: currentUser }))
vi.mock('@/lib/mailer', () => ({ sendMail }))
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))

describe.skipIf(!database)('Grants Committee invitations on PostgreSQL', () => {
  let db: typeof import('@/lib/db')['prisma']
  let actions: typeof import('@/app/(site)/grants/_lib/committee-invitation-actions')
  let getRoster: typeof import('@/app/(site)/grants/_lib/committee-config')['readCommitteeRoster']
  let clearFlagCache: typeof import('@/lib/flag-store')['clearFlagCache']
  const prefix = 'invite-' + randomUUID()
  const makeUser = (part: string, admin = false): CurrentUser => ({
    id: prefix + '-' + part, email: prefix + '-' + part + '@example.test', name: 'Synthetic ' + part, image: null,
    isSuperAdmin: admin, superAdminNeedsSecondFactor: false, hasSecondFactor: admin, permissions: new Set(),
  })
  const [admin, lead, first, second, third, fourth, extra] = [
    makeUser('admin', true), makeUser('lead'), makeUser('one'), makeUser('two'),
    makeUser('three'), makeUser('four'), makeUser('extra'),
  ]
  const users = [admin, lead, first, second, third, fourth, extra]
  const keys = ['grants', 'grantsCommitteeInvitations']
  const mailError = (ok: boolean) => ok ? Promise.resolve() : Promise.reject(new Error('synthetic delivery failure'))

  beforeAll(async () => {
    ({ prisma: db } = await import('@/lib/db'))
    actions = await import('@/app/(site)/grants/_lib/committee-invitation-actions')
    ;({ readCommitteeRoster: getRoster } = await import('@/app/(site)/grants/_lib/committee-config'))
    ;({ clearFlagCache } = await import('@/lib/flag-store'))
    vi.stubEnv('GRANTS_SHORTLISTER_ID', lead.id)
    vi.stubEnv('GRANTS_COMMITTEE_MEMBER_IDS', 'legacy-1,legacy-2,legacy-3,legacy-4')
    expect(await db.grantCommitteeSeat.count()).toBe(0)
    await db.user.createMany({ data: users.map(({ id, name, email }) => ({ id, name, email, emailVerified: id !== extra.id })) })
    await db.featureFlag.createMany({ data: keys.map((key) => ({ key, enabled: true })) })
    clearFlagCache()
    sendMail.mockResolvedValue(undefined)
  })

  afterAll(async () => {
    if (!db) return
    await db.grantCommitteeSettings.deleteMany()
    await db.grantCommitteeSeat.deleteMany({ where: { email: { startsWith: prefix } } })
    await db.auditLog.deleteMany({ where: { actorId: { in: users.map(({ id }) => id) } } })
    await db.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } })
    await db.featureFlag.deleteMany({ where: { key: { in: keys } } })
    clearFlagCache?.()
    vi.unstubAllEnvs()
    await db.$disconnect()
  })

  const roster = () => db.grantCommitteeSeat.findMany({ where: { email: { startsWith: prefix } }, orderBy: { slot: 'asc' } })

  it('US-1 reserves four seats, sends through Hub mail and recovers delivery failure', async () => {
    currentUser.mockResolvedValue(first)
    await expect(actions.inviteCommitteeMember({ email: second.email })).resolves.toMatchObject({ ok: false })
    currentUser.mockResolvedValue(admin)
    await expect(actions.inviteCommitteeMember({ email: lead.email })).resolves.toMatchObject({ ok: false })
    sendMail.mockImplementationOnce(() => mailError(false))
    await expect(actions.inviteCommitteeMember({ email: first.email.toUpperCase() })).resolves.toMatchObject({ ok: true, data: { mailSent: false } })
    await expect(actions.inviteCommitteeMember({ email: first.email })).resolves.toMatchObject({ ok: false })
    const saved = (await roster())[0]
    expect(saved).toMatchObject({ slot: 1, email: first.email, userId: null })
    await expect(actions.resendCommitteeInvitation({ id: saved.id })).resolves.toMatchObject({ ok: true, data: { mailSent: true } })
    expect(sendMail).toHaveBeenLastCalledWith(expect.objectContaining({ to: first.email, text: expect.stringContaining('/grants/committee/join') }))
    for (const member of [second, third]) expect((await actions.inviteCommitteeMember({ email: member.email })).ok).toBe(true)
    const competing = await Promise.all([fourth, extra].map(({ email }) => actions.inviteCommitteeMember({ email })))
    expect(competing.filter((result) => result.ok)).toHaveLength(1)
    expect(await roster()).toHaveLength(4)
    const last = (await roster())[3]
    await expect(actions.revokeCommitteeInvitation({ id: last.id })).resolves.toMatchObject({ ok: true })
    expect(await roster()).toHaveLength(3)
    await expect(actions.inviteCommitteeMember({ email: extra.email })).resolves.toMatchObject({ ok: true })
    await expect(actions.revokeCommitteeInvitation({ id: last.id })).resolves.toMatchObject({ ok: false })
    await expect(actions.inviteCommitteeMember({ email: fourth.email })).resolves.toMatchObject({ ok: false })
  })

  it('US-2 accepts only a current, verified invitation and grants only review', async () => {
    const seats = await roster()
    const seat = seats[0]
    const other = seats[1]
    currentUser.mockResolvedValue(extra)
    await expect(actions.acceptCommitteeInvitation({ id: seats[3].id })).resolves.toMatchObject({ ok: false })
    currentUser.mockResolvedValue(first)
    await expect(actions.acceptCommitteeInvitation({ id: other.id })).resolves.toMatchObject({ ok: false })
    await db.grantCommitteeSeat.update({ where: { id: seat.id }, data: { expiresAt: new Date(0) } })
    await expect(actions.acceptCommitteeInvitation({ id: seat.id })).resolves.toMatchObject({ ok: false })
    currentUser.mockResolvedValue(admin)
    await expect(actions.resendCommitteeInvitation({ id: seat.id })).resolves.toMatchObject({ ok: true })
    currentUser.mockResolvedValue(first)
    const replies = await Promise.all([0, 1].map(() => actions.acceptCommitteeInvitation({ id: seat.id })))
    expect(replies.filter((reply) => reply.ok)).toHaveLength(1)
    expect(await db.userPermission.findMany({ where: { userId: first.id }, select: { permission: true } }))
      .toEqual([{ permission: 'grants.review' }])
    expect(await db.auditLog.count({ where: { actorId: first.id, action: 'grant.committee.accept', entityId: seat.id } })).toBe(1)
    currentUser.mockResolvedValue(admin)
    await expect(actions.revokeCommitteeInvitation({ id: seat.id })).resolves.toMatchObject({ ok: false })
  })

  it('US-3 isolates activated seats from the legacy environment roster', async () => {
    expect(await getRoster(db, true)).toBeNull()
    expect(await getRoster(db, false)).toEqual({ shortlisterId: lead.id, memberIds: ['legacy-1', 'legacy-2', 'legacy-3', 'legacy-4'] })
    const seats = await roster()
    currentUser.mockResolvedValue(admin)
    await actions.revokeCommitteeInvitation({ id: seats[3].id })
    await actions.inviteCommitteeMember({ email: fourth.email })
    const complete = await roster()
    for (const [index, member] of [second, third, fourth].entries()) {
      currentUser.mockResolvedValue(member)
      expect((await actions.acceptCommitteeInvitation({ id: complete[index + 1].id })).ok).toBe(true)
    }
    await expect(getRoster(db, true)).resolves.toEqual({
      shortlisterId: lead.id, memberIds: [first.id, second.id, third.id, fourth.id], managed: true, approvalRule: 'unanimity',
    })
    await db.featureFlag.update({ where: { key: 'grantsCommitteeInvitations' }, data: { enabled: false } })
    clearFlagCache()
    currentUser.mockResolvedValue(admin)
    await expect(actions.inviteCommitteeMember({ email: extra.email })).resolves.toMatchObject({ ok: false })
    expect((await getRoster(db, true))?.memberIds).toHaveLength(4)
  })

  it('US-4 changes future size and rule while eligible reviewers retain their assigned cases', async () => {
    await db.featureFlag.update({ where: { key: 'grantsCommitteeInvitations' }, data: { enabled: true } })
    clearFlagCache()
    const pinned = { actorId: lead.id, reviewerIds: [first.id, second.id, third.id, fourth.id] }
    currentUser.mockResolvedValue(first)
    const initial = { revision: 0, seatCount: 6, approvalRule: 'absolute_majority' } as const
    await expect(actions.updateCommitteeSettings(initial)).resolves.toMatchObject({ ok: false })
    currentUser.mockResolvedValue(admin)
    await expect(actions.updateCommitteeSettings({ ...initial, seatCount: 3 })).resolves.toMatchObject({ ok: false })
    await expect(actions.updateCommitteeSettings(initial)).resolves.toMatchObject({ ok: true })
    await expect(actions.updateCommitteeSettings({ ...initial, seatCount: 7 })).resolves.toMatchObject({ ok: false })
    await expect(getRoster(db, true)).resolves.toBeNull()
    await expect(getRoster(db, true, pinned)).resolves.toMatchObject({ memberIds: pinned.reviewerIds })
    await expect(actions.inviteCommitteeMember({ email: extra.email })).resolves.toMatchObject({ ok: true })
    expect((await roster()).at(-1)?.slot).toBe(5)
    await expect(actions.revokeCommitteeInvitation({ id: (await roster()).at(-1)!.id })).resolves.toMatchObject({ ok: true })
    await expect(actions.removeCommitteeMember({ id: (await roster())[0].id })).resolves.toMatchObject({ ok: true })
    await expect(actions.updateCommitteeSettings({ revision: 1, seatCount: 3, approvalRule: 'simple_majority' }))
      .resolves.toMatchObject({ ok: true })
    await expect(getRoster(db, true)).resolves.toMatchObject({
      memberIds: [second.id, third.id, fourth.id], approvalRule: 'simple_majority',
    })
    await expect(getRoster(db, true, pinned)).resolves.toMatchObject({ memberIds: pinned.reviewerIds })
    await db.userPermission.deleteMany({ where: { userId: first.id, permission: 'grants.review' } })
    await expect(getRoster(db, true, pinned)).resolves.toBeNull()

    await expect(actions.updateCommitteeSettings({ revision: 2, seatCount: 4, approvalRule: 'simple_majority' }))
      .resolves.toMatchObject({ ok: true })
    const racing = await Promise.all([
      actions.updateCommitteeSettings({ revision: 3, seatCount: 3, approvalRule: 'simple_majority' }),
      actions.inviteCommitteeMember({ email: extra.email }),
    ])
    expect(racing.filter(({ ok }) => ok)).toHaveLength(1)
    const settings = await db.grantCommitteeSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect((await roster()).length).toBeLessThanOrEqual(settings.seatCount)
  })
})
