'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { hasCompleteBasicProfile } from '@/lib/profile'
import { buildAnswersSchema, canJoin } from './rules'

export const joinHackathon = action(
  { schema: z.object({ hackathonId: z.string().min(1), answers: z.record(z.string(), z.unknown()), acceptTerms: z.boolean() }), permission: 'user' },
  async ({ hackathonId, answers, acceptTerms }, user) => {
    const h = await prisma.hackathon.findUnique({ where: { id: hackathonId }, include: { event: { select: { slug: true } }, fields: { where: { stageId: null } } } })
    if (!h) throw new ActionError('Hackathon not found')
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, country: true, builderRoles: true } })
    if (!hasCompleteBasicProfile(profile)) throw new ActionError('Complete your profile first: name, country and at least one role')
    const [participants, mine] = await Promise.all([
      prisma.participant.count({ where: { hackathonId, status: 'active' } }),
      prisma.participant.findUnique({ where: { hackathonId_userId: { hackathonId, userId: user.id } } }),
    ])
    const check = canJoin(h, { now: new Date(), participants, alreadyJoined: mine?.status === 'active', acceptedTerms: acceptTerms })
    if (!check.ok) throw new ActionError(check.reason)
    const parsed = buildAnswersSchema(h.fields).safeParse(answers)
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? 'Check your answers')
    const data = { answers: parsed.data as object, status: 'active', termsAcceptedAt: h.termsUrl ? new Date() : null }
    await prisma.participant.upsert({ where: { hackathonId_userId: { hackathonId, userId: user.id } }, create: { hackathonId, userId: user.id, ...data }, update: data })
    await recordAudit({ actorId: user.id, action: 'hackathon.join', entityType: 'Hackathon', entityId: hackathonId })
    revalidatePath(`/events/${h.event.slug}`, 'layout')
    return { slug: h.event.slug }
  },
)

export const leaveHackathon = action({ schema: z.object({ hackathonId: z.string().min(1) }), permission: 'user' }, async ({ hackathonId }, user) => {
  const p = await prisma.participant.findUnique({ where: { hackathonId_userId: { hackathonId, userId: user.id } }, include: { hackathon: { select: { event: { select: { slug: true } } } } } })
  if (!p || p.status !== 'active') throw new ActionError("You haven't joined this hackathon")
  const onTeam = await prisma.submission.count({ where: { hackathonId, status: 'active', project: { members: { some: { userId: user.id } } } } })
  if (onTeam) throw new ActionError('Your team has a submission — leave the project team or withdraw the submission first')
  await prisma.participant.update({ where: { id: p.id }, data: { status: 'withdrawn' } })
  await recordAudit({ actorId: user.id, action: 'hackathon.leave', entityType: 'Hackathon', entityId: hackathonId })
  revalidatePath(`/events/${p.hackathon.event.slug}`, 'layout')
  return null
})
