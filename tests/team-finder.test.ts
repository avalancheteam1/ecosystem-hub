import { test } from 'vitest'
import assert from 'node:assert/strict'
import { canInviteSeeker, matchesSeeker } from '@/app/(site)/events/_lib/hackathons/team-finder'

const ok = { inviterRole: 'owner', inviterActive: true, projectArchived: false, inviterId: 'a', inviteeId: 'b', inviteeActive: true, inviteeLooking: true, inviteeOnProject: false, openInviteExists: false }

test('canInviteSeeker: an active owner may invite an active participant who is looking', () => {
  assert.deepEqual(canInviteSeeker(ok), { ok: true })
})

test('canInviteSeeker: the inviter must own the project and be an active participant', () => {
  assert.equal(canInviteSeeker({ ...ok, inviterRole: 'writer' }).ok, false)
  assert.equal(canInviteSeeker({ ...ok, inviterRole: null }).ok, false)
  assert.equal(canInviteSeeker({ ...ok, inviterActive: false }).ok, false)
  assert.equal(canInviteSeeker({ ...ok, projectArchived: true }).ok, false)
})

test('canInviteSeeker: the invitee must be an active participant, currently looking, not on the team and not invited yet', () => {
  assert.equal(canInviteSeeker({ ...ok, inviteeActive: false }).ok, false)
  assert.equal(canInviteSeeker({ ...ok, inviteeLooking: false }).ok, false)
  assert.equal(canInviteSeeker({ ...ok, inviteeOnProject: true }).ok, false)
  assert.equal(canInviteSeeker({ ...ok, openInviteExists: true }).ok, false)
  assert.equal(canInviteSeeker({ ...ok, inviteeId: 'a' }).ok, false)
})

test('matchesSeeker: role, skill (case-insensitive) and track filters; no tracks = open to any', () => {
  const s = { builderRoles: ['developer'], skills: ['Solidity', 'TypeScript'], trackIds: ['defi'] }
  assert.equal(matchesSeeker(s, {}), true)
  assert.equal(matchesSeeker(s, { role: 'developer', skill: 'solidity', track: 'defi' }), true)
  assert.equal(matchesSeeker(s, { role: 'founder' }), false)
  assert.equal(matchesSeeker(s, { skill: 'Rust' }), false)
  assert.equal(matchesSeeker(s, { track: 'gaming' }), false)
  assert.equal(matchesSeeker({ ...s, trackIds: [] }, { track: 'gaming' }), true)
})
