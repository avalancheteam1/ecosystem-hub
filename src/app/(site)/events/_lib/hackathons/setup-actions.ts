'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { brandedShell, button, CELL, esc, PARA } from '@/lib/email-template'
import { IMAGE_KINDS } from '@/lib/image-kinds'
import { sendMail } from '@/lib/mailer'
import { isOwnUpload } from '@/lib/storage'
import { isTimeZone } from '@/lib/timezones'
import { verifiedUserIdByEmail } from './bind'
import { assertManage } from './manage'
import { FIELD_TYPES, publishChecklist, validateStages } from './rules'

// Organiser console actions (/manage/hackathons/[id]). Every action re-checks
// canManageHackathon — organisers are per-hackathon data, not a permission.

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'
const id = z.string().min(1)
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null)
const optUrl = z
  .union([z.string().trim().url('Enter a full link').refine((u) => /^https?:\/\//i.test(u), 'Link must start with https://'), z.literal('')])
  .optional()
  .transform((v) => v || null)
const optDate = z
  .union([z.iso.datetime({ offset: true }), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null))
const date = z.iso.datetime({ offset: true, error: 'Pick a date and time' }).transform((v) => new Date(v))
const timezone = z.string().refine(isTimeZone, 'Pick a timezone')

function revalidate(h: { id: string; event: { slug: string } }) {
  revalidatePath(`/manage/hackathons/${h.id}`, 'layout')
  revalidatePath(`/events/${h.event.slug}`, 'layout')
}

/** Stages with entries are locked against structural edits that would change what was judged. */
async function stageHasReviews(stageId: string) {
  return (await prisma.review.count({ where: { submittedAt: { not: null }, assignment: { entry: { stageId } } } })) > 0
}

// ── create ─────────────────────────────────────────────────────────────────

export const createHackathon = action(
  { schema: z.object({ eventId: id, opensAt: date, closesAt: date, timezone }).refine((v) => v.opensAt < v.closesAt, { message: 'Submissions must open before they close', path: ['closesAt'] }), permission: 'hackathons.manage' },
  async ({ eventId, opensAt, closesAt, timezone }, user) => {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { hackathon: { select: { id: true } } } })
  if (!event) throw new ActionError('Event not found')
  if (event.hackathon) return { id: event.hackathon.id }
  const h = await prisma.hackathon.create({
    data: {
      eventId,
      timezone,
      tagline: '',
      aboutMd: event.descriptionMd ?? '',
      organizers: { create: { email: user.email.toLowerCase(), userId: user.id, invitedById: user.id } },
      stages: {
        create: {
          order: 0,
          name: 'Project submission',
          opensAt,
          closesAt,
          criteria: { create: [{ name: 'Technical execution', weight: 2, order: 0 }, { name: 'Innovation', weight: 1, order: 1 }, { name: 'Impact', weight: 1, order: 2 }] },
        },
      },
    },
  })
  await recordAudit({ actorId: user.id, action: 'hackathon.create', entityType: 'Hackathon', entityId: h.id, after: { eventId } })
  revalidatePath('/admin/events', 'layout')
  return { id: h.id }
  },
)

// ── overview ───────────────────────────────────────────────────────────────

export const updateOverview = action(
  {
    schema: z
      .object({
        hackathonId: id,
        timezone,
        tagline: z.string().trim().max(140),
        aboutMd: z.string().trim().max(30_000),
        rulesMd: optText(30_000),
        termsUrl: optUrl,
        registrationOpensAt: optDate,
        registrationClosesAt: optDate,
        teamSizeMin: z.coerce.number().int().min(1).max(50),
        teamSizeMax: z.coerce.number().int().min(1).max(50),
        maxParticipants: z.union([z.coerce.number().int().min(1).max(100_000), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v == null ? null : v)),
      })
      .refine((v) => v.teamSizeMin <= v.teamSizeMax, { message: 'Minimum team size can’t be above the maximum', path: ['teamSizeMin'] })
      .refine((v) => !v.registrationOpensAt || !v.registrationClosesAt || v.registrationOpensAt < v.registrationClosesAt, { message: 'Registration must open before it closes' }),
    permission: 'user',
  },
  async ({ hackathonId, ...data }, user) => {
    const h = await assertManage(hackathonId, user)
    const before = await prisma.hackathon.findUnique({ where: { id: hackathonId }, select: { timezone: true, tagline: true, termsUrl: true, teamSizeMin: true, teamSizeMax: true, maxParticipants: true, registrationOpensAt: true, registrationClosesAt: true } })
    await prisma.hackathon.update({ where: { id: hackathonId }, data })
    await recordAudit({ actorId: user.id, action: 'hackathon.overview.update', entityType: 'Hackathon', entityId: hackathonId, before, after: { timezone: data.timezone, tagline: data.tagline, termsUrl: data.termsUrl, teamSizeMin: data.teamSizeMin, teamSizeMax: data.teamSizeMax, maxParticipants: data.maxParticipants, registrationOpensAt: data.registrationOpensAt, registrationClosesAt: data.registrationClosesAt } })
    revalidate(h)
    return null
  },
)

// ── tracks & prizes ────────────────────────────────────────────────────────

export const saveTrack = action(
  { schema: z.object({ hackathonId: id, trackId: id.optional(), name: z.string().trim().min(1, 'Name the track').max(60), descriptionMd: optText(5000), sponsor: optText(80), sponsorLogoUrl: z.string().url().nullable().optional().transform((v) => v ?? null) }), permission: 'user' },
  async ({ hackathonId, trackId, ...data }, user) => {
    const h = await assertManage(hackathonId, user)
    if (data.sponsorLogoUrl && !isOwnUpload(data.sponsorLogoUrl, IMAGE_KINDS['sponsor-logo'].category, hackathonId)) throw new ActionError('Upload the sponsor logo here')
    if (trackId) {
      const r = await prisma.hackathonTrack.updateMany({ where: { id: trackId, hackathonId }, data })
      if (!r.count) throw new ActionError('Track not found')
    } else {
      const order = await prisma.hackathonTrack.count({ where: { hackathonId } })
      await prisma.hackathonTrack.create({ data: { hackathonId, order, ...data } })
    }
    await recordAudit({ actorId: user.id, action: trackId ? 'hackathon.track.update' : 'hackathon.track.create', entityType: 'Hackathon', entityId: hackathonId, after: data })
    revalidate(h)
    return null
  },
)

export const deleteTrack = action({ schema: z.object({ hackathonId: id, trackId: id }), permission: 'user' }, async ({ hackathonId, trackId }, user) => {
  const h = await assertManage(hackathonId, user)
  const used = await prisma.submission.count({ where: { hackathonId, trackIds: { has: trackId } } })
  if (used) throw new ActionError(`${used} submission(s) entered this track — it can't be deleted`)
  const r = await prisma.hackathonTrack.deleteMany({ where: { id: trackId, hackathonId } })
  if (!r.count) throw new ActionError('Track not found')
  await recordAudit({ actorId: user.id, action: 'hackathon.track.delete', entityType: 'Hackathon', entityId: hackathonId, before: { trackId } })
  revalidate(h)
  return null
})

export const savePrize = action(
  {
    schema: z.object({
      hackathonId: id,
      prizeId: id.optional(),
      trackId: z.string().optional().transform((v) => v || null),
      placement: z.coerce.number().int().min(1).max(100),
      title: z.string().trim().min(1, 'Name the prize').max(80),
      amount: optText(40),
      description: optText(500),
    }),
    permission: 'user',
  },
  async ({ hackathonId, prizeId, ...data }, user) => {
    const h = await assertManage(hackathonId, user)
    if (data.trackId && !(await prisma.hackathonTrack.count({ where: { id: data.trackId, hackathonId } }))) throw new ActionError('Unknown track')
    if (prizeId) {
      const r = await prisma.hackathonPrize.updateMany({ where: { id: prizeId, hackathonId }, data })
      if (!r.count) throw new ActionError('Prize not found')
    } else {
      const order = await prisma.hackathonPrize.count({ where: { hackathonId } })
      await prisma.hackathonPrize.create({ data: { hackathonId, order, ...data } })
    }
    await recordAudit({ actorId: user.id, action: prizeId ? 'hackathon.prize.update' : 'hackathon.prize.create', entityType: 'Hackathon', entityId: hackathonId, after: data })
    revalidate(h)
    return null
  },
)

export const setPrizePool = action({ schema: z.object({ hackathonId: id, prizePool: optText(40) }), permission: 'user' }, async ({ hackathonId, prizePool }, user) => {
  const h = await assertManage(hackathonId, user)
  await prisma.hackathon.update({ where: { id: hackathonId }, data: { prizePool } })
  await recordAudit({ actorId: user.id, action: 'hackathon.prizePool.set', entityType: 'Hackathon', entityId: hackathonId, before: { prizePool: h.prizePool }, after: { prizePool } })
  revalidate(h)
  return null
})

export const deletePrize = action({ schema: z.object({ hackathonId: id, prizeId: id }), permission: 'user' }, async ({ hackathonId, prizeId }, user) => {
  const h = await assertManage(hackathonId, user)
  const r = await prisma.hackathonPrize.deleteMany({ where: { id: prizeId, hackathonId } })
  if (!r.count) throw new ActionError('Prize not found')
  await recordAudit({ actorId: user.id, action: 'hackathon.prize.delete', entityType: 'Hackathon', entityId: hackathonId, before: { prizeId } })
  revalidate(h)
  return null
})

// ── stages & criteria ──────────────────────────────────────────────────────

const stageSchema = z
  .object({
    hackathonId: id,
    stageId: id.optional(),
    name: z.string().trim().min(1, 'Name the stage').max(60),
    descriptionMd: optText(10_000),
    opensAt: date,
    closesAt: date,
    reviewMode: z.enum(['all', 'random']),
    judgesPerSubmission: z.union([z.coerce.number().int().min(1).max(20), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v == null ? null : v)),
    scaleMax: z.coerce.number().int().min(1).max(100),
    showCriteria: z.boolean(),
  })
  .refine((s) => s.reviewMode !== 'random' || s.judgesPerSubmission, { message: 'Set how many judges review each submission', path: ['judgesPerSubmission'] })

export const saveStage = action({ schema: stageSchema, permission: 'user' }, async ({ hackathonId, stageId, ...data }, user) => {
  const h = await assertManage(hackathonId, user)
  const stages = await prisma.hackathonStage.findMany({ where: { hackathonId }, orderBy: { order: 'asc' } })
  const existing = stageId ? stages.find((s) => s.id === stageId) : undefined
  if (stageId && !existing) throw new ActionError('Stage not found')
  if (existing && (await stageHasReviews(existing.id))) {
    // Judged work must stay what was judged: no new scale, no reopened window.
    if (existing.scaleMax !== data.scaleMax) throw new ActionError('Judges already scored this stage — the scale can’t change now')
    // Inputs carry minutes only, so compare at minute precision.
    const moved = (a: Date, b: Date) => Math.abs(+a - +b) >= 60_000
    if (moved(existing.opensAt, data.opensAt) || moved(existing.closesAt, data.closesAt)) throw new ActionError('Judges already scored this stage — its window can’t change now')
  }
  const next = existing
    ? stages.map((s) => (s.id === stageId ? { ...s, ...data } : s))
    : [...stages, { ...data, order: stages.length, judgingClosedAt: null }]
  const errors = validateStages(next)
  if (errors.length) throw new ActionError(errors[0]!)
  if (existing) await prisma.hackathonStage.update({ where: { id: existing.id }, data })
  else await prisma.hackathonStage.create({ data: { hackathonId, order: stages.length, ...data } })
  await recordAudit({ actorId: user.id, action: existing ? 'hackathon.stage.update' : 'hackathon.stage.create', entityType: 'Hackathon', entityId: hackathonId, before: existing ? { name: existing.name, opensAt: existing.opensAt, closesAt: existing.closesAt, reviewMode: existing.reviewMode, judgesPerSubmission: existing.judgesPerSubmission } : undefined, after: { name: data.name, opensAt: data.opensAt, closesAt: data.closesAt, reviewMode: data.reviewMode, judgesPerSubmission: data.judgesPerSubmission } })
  revalidate(h)
  return null
})

export const deleteStage = action({ schema: z.object({ hackathonId: id, stageId: id }), permission: 'user' }, async ({ hackathonId, stageId }, user) => {
  const h = await assertManage(hackathonId, user)
  if (await prisma.stageEntry.count({ where: { stageId } })) throw new ActionError('Teams already submitted to this stage — it can’t be deleted')
  const stages = await prisma.hackathonStage.findMany({ where: { hackathonId }, orderBy: { order: 'asc' }, select: { id: true } })
  if (!stages.some((s) => s.id === stageId)) throw new ActionError('Stage not found')
  await prisma.$transaction([
    prisma.hackathonStage.delete({ where: { id: stageId } }),
    ...stages.filter((s) => s.id !== stageId).map((s, i) => prisma.hackathonStage.update({ where: { id: s.id }, data: { order: i } })),
  ])
  await recordAudit({ actorId: user.id, action: 'hackathon.stage.delete', entityType: 'Hackathon', entityId: hackathonId, before: { stageId } })
  revalidate(h)
  return null
})

export const saveCriterion = action(
  { schema: z.object({ hackathonId: id, stageId: id, criterionId: id.optional(), name: z.string().trim().min(1, 'Name the criterion').max(60), description: optText(500), weight: z.coerce.number().int().min(1).max(100) }), permission: 'user' },
  async ({ hackathonId, stageId, criterionId, ...data }, user) => {
    const h = await assertManage(hackathonId, user)
    if (!(await prisma.hackathonStage.count({ where: { id: stageId, hackathonId } }))) throw new ActionError('Stage not found')
    if (await stageHasReviews(stageId)) throw new ActionError('Judges already scored this stage — criteria are locked')
    if (criterionId) {
      const r = await prisma.criterion.updateMany({ where: { id: criterionId, stageId }, data })
      if (!r.count) throw new ActionError('Criterion not found')
    } else {
      const order = await prisma.criterion.count({ where: { stageId } })
      await prisma.criterion.create({ data: { stageId, order, ...data } })
    }
    await recordAudit({ actorId: user.id, action: criterionId ? 'hackathon.criterion.update' : 'hackathon.criterion.create', entityType: 'Hackathon', entityId: hackathonId, after: { stageId, ...data } })
    revalidate(h)
    return null
  },
)

export const deleteCriterion = action({ schema: z.object({ hackathonId: id, stageId: id, criterionId: id }), permission: 'user' }, async ({ hackathonId, stageId, criterionId }, user) => {
  const h = await assertManage(hackathonId, user)
  if (await stageHasReviews(stageId)) throw new ActionError('Judges already scored this stage — criteria are locked')
  const r = await prisma.criterion.deleteMany({ where: { id: criterionId, stage: { id: stageId, hackathonId } } })
  if (!r.count) throw new ActionError('Criterion not found')
  await recordAudit({ actorId: user.id, action: 'hackathon.criterion.delete', entityType: 'Hackathon', entityId: hackathonId, before: { criterionId } })
  revalidate(h)
  return null
})

// ── form fields (registration questions + stage fields) ──────────────────────

export const saveField = action(
  {
    schema: z
      .object({
        hackathonId: id,
        fieldId: id.optional(),
        stageId: z.string().optional().transform((v) => v || null),
        label: z.string().trim().min(1, 'Write the question').max(200),
        help: optText(500),
        type: z.enum(FIELD_TYPES),
        required: z.boolean(),
        options: z.array(z.string().trim().min(1).max(80)).max(30).transform((o) => [...new Set(o)]),
        maxLength: z.union([z.coerce.number().int().min(1).max(20_000), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v == null ? null : v)),
      })
      .refine((f) => !['select', 'multi_select'].includes(f.type) || f.options.length >= 2, { message: 'Add at least two options', path: ['options'] }),
    permission: 'user',
  },
  async ({ hackathonId, fieldId, ...data }, user) => {
    const h = await assertManage(hackathonId, user)
    if (data.stageId && !(await prisma.hackathonStage.count({ where: { id: data.stageId, hackathonId } }))) throw new ActionError('Stage not found')
    const clean = { ...data, options: ['select', 'multi_select'].includes(data.type) ? data.options : [] }
    if (fieldId) {
      const r = await prisma.formField.updateMany({ where: { id: fieldId, hackathonId }, data: clean })
      if (!r.count) throw new ActionError('Question not found')
    } else {
      const order = await prisma.formField.count({ where: { hackathonId, stageId: data.stageId } })
      await prisma.formField.create({ data: { hackathonId, order, ...clean } })
    }
    await recordAudit({ actorId: user.id, action: fieldId ? 'hackathon.field.update' : 'hackathon.field.create', entityType: 'Hackathon', entityId: hackathonId, after: { label: data.label, type: data.type, stageId: data.stageId } })
    revalidate(h)
    return null
  },
)

export const deleteField = action({ schema: z.object({ hackathonId: id, fieldId: id }), permission: 'user' }, async ({ hackathonId, fieldId }, user) => {
  const h = await assertManage(hackathonId, user)
  // Answers are keyed by field id; existing answers simply stop being shown.
  const r = await prisma.formField.deleteMany({ where: { id: fieldId, hackathonId } })
  if (!r.count) throw new ActionError('Question not found')
  await recordAudit({ actorId: user.id, action: 'hackathon.field.delete', entityType: 'Hackathon', entityId: hackathonId, before: { fieldId } })
  revalidate(h)
  return null
})

// ── people ─────────────────────────────────────────────────────────────────

const email = z.string().trim().toLowerCase().email('Enter a valid email')

async function sendRoleInvite(to: string, role: 'organiser' | 'judge', h: { id: string; event: { name: string; slug: string } }, inviter: string) {
  const url = role === 'judge' ? `${siteUrl()}/judge` : `${siteUrl()}/manage/hackathons/${h.id}`
  const what = role === 'judge' ? 'judge' : 'help organise'
  await sendMail({
    to,
    subject: `${inviter} invited you to ${what} ${h.event.name}`,
    text: `${inviter} invited you to ${what} "${h.event.name}" on the team1 Ecosystem Hub.\n\nSign in with ${to} to get started:\n${url}`,
    html: brandedShell({
      preheader: `You're invited to ${what} ${h.event.name}`,
      body: `<tr><td class="m-px" style="${CELL}">
        <p style="${PARA}">${esc(inviter)} invited you to ${what} <strong>${esc(h.event.name)}</strong> on the team1 Ecosystem Hub.</p>
        <p style="${PARA}">Sign in with <strong>${esc(to)}</strong> to get started.</p>
        ${button(url, role === 'judge' ? 'Open judging' : 'Open the hackathon')}
      </td></tr>`,
    }),
  }).catch((err) => console.error('[hackathons] invite mail failed', err))
}

export const inviteOrganizer = action({ schema: z.object({ hackathonId: id, email }), permission: 'user' }, async ({ hackathonId, email }, user) => {
  const h = await assertManage(hackathonId, user)
  const exists = await prisma.hackathonOrganizer.findUnique({ where: { hackathonId_email: { hackathonId, email } } })
  if (exists) throw new ActionError('Already an organiser')
  await prisma.hackathonOrganizer.create({ data: { hackathonId, email, userId: await verifiedUserIdByEmail(email), invitedById: user.id } })
  await sendRoleInvite(email, 'organiser', h, user.name)
  await recordAudit({ actorId: user.id, action: 'hackathon.organizer.add', entityType: 'Hackathon', entityId: hackathonId, after: { email } })
  revalidate(h)
  return null
})

export const removeOrganizer = action({ schema: z.object({ hackathonId: id, organizerId: id }), permission: 'user' }, async ({ hackathonId, organizerId }, user) => {
  const h = await assertManage(hackathonId, user)
  const count = await prisma.hackathonOrganizer.count({ where: { hackathonId } })
  if (count <= 1) throw new ActionError('A hackathon needs at least one organiser')
  const o = await prisma.hackathonOrganizer.findFirst({ where: { id: organizerId, hackathonId } })
  if (!o) throw new ActionError('Organiser not found')
  await prisma.hackathonOrganizer.delete({ where: { id: o.id } })
  await recordAudit({ actorId: user.id, action: 'hackathon.organizer.remove', entityType: 'Hackathon', entityId: hackathonId, before: { email: o.email } })
  revalidate(h)
  return null
})

export const saveJudge = action(
  { schema: z.object({ hackathonId: id, judgeId: id.optional(), email: email.optional(), trackIds: z.array(z.string()).max(50) }), permission: 'user' },
  async ({ hackathonId, judgeId, email, trackIds }, user) => {
    const h = await assertManage(hackathonId, user)
    const valid = await prisma.hackathonTrack.findMany({ where: { hackathonId, id: { in: trackIds } }, select: { id: true } })
    if (valid.length !== new Set(trackIds).size) throw new ActionError('Unknown track')
    if (judgeId) {
      const r = await prisma.hackathonJudge.updateMany({ where: { id: judgeId, hackathonId }, data: { trackIds } })
      if (!r.count) throw new ActionError('Judge not found')
      await recordAudit({ actorId: user.id, action: 'hackathon.judge.update', entityType: 'Hackathon', entityId: hackathonId, after: { judgeId, trackIds } })
    } else {
      if (!email) throw new ActionError('Enter the judge’s email')
      if (await prisma.hackathonJudge.findUnique({ where: { hackathonId_email: { hackathonId, email } } })) throw new ActionError('Already a judge')
      await prisma.hackathonJudge.create({ data: { hackathonId, email, trackIds, userId: await verifiedUserIdByEmail(email), invitedById: user.id } })
      await sendRoleInvite(email, 'judge', h, user.name)
      await recordAudit({ actorId: user.id, action: 'hackathon.judge.add', entityType: 'Hackathon', entityId: hackathonId, after: { email, trackIds } })
    }
    revalidate(h)
    return null
  },
)

export const removeJudge = action({ schema: z.object({ hackathonId: id, judgeId: id }), permission: 'user' }, async ({ hackathonId, judgeId }, user) => {
  const h = await assertManage(hackathonId, user)
  const j = await prisma.hackathonJudge.findFirst({ where: { id: judgeId, hackathonId }, include: { _count: { select: { assignments: { where: { review: { submittedAt: { not: null } } } } } } } })
  if (!j) throw new ActionError('Judge not found')
  if (j._count.assignments) throw new ActionError(`${j.email} already submitted ${j._count.assignments} review(s) — they can’t be removed`)
  await prisma.hackathonJudge.delete({ where: { id: j.id } })
  await recordAudit({ actorId: user.id, action: 'hackathon.judge.remove', entityType: 'Hackathon', entityId: hackathonId, before: { email: j.email } })
  revalidate(h)
  return null
})

// ── publish ────────────────────────────────────────────────────────────────

export const setHackathonStatus = action({ schema: z.object({ hackathonId: id, status: z.enum(['draft', 'published']) }), permission: 'user' }, async ({ hackathonId, status }, user) => {
  const h = await assertManage(hackathonId, user)
  if (status === 'published') {
    const full = await prisma.hackathon.findUniqueOrThrow({ where: { id: hackathonId }, include: { stages: { include: { criteria: { select: { weight: true } } } } } })
    const problems = publishChecklist({ ...full, eventPublished: h.event.status === 'published' })
    if (problems.length) throw new ActionError(problems[0]!)
  }
  await prisma.hackathon.update({ where: { id: hackathonId }, data: { status } })
  await recordAudit({ actorId: user.id, action: 'hackathon.status.set', entityType: 'Hackathon', entityId: hackathonId, before: { status: h.status }, after: { status } })
  revalidate(h)
  return null
})
