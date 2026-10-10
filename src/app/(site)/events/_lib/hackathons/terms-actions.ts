'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'

/** The signed-in organiser/judge accepts the data terms of one hackathon (their own row only). */
export const acceptHackathonTerms = action(
  { schema: z.object({ hackathonId: z.string().min(1), role: z.enum(['organizer', 'judge']) }), permission: 'user' },
  async ({ hackathonId, role }, user) => {
    const where = { hackathonId, userId: user.id }
    const row = role === 'organizer' ? await prisma.hackathonOrganizer.findFirst({ where }) : await prisma.hackathonJudge.findFirst({ where })
    if (!row) throw new ActionError('Not found')
    if (row.termsAcceptedAt) return null
    const termsAcceptedAt = new Date()
    if (role === 'organizer') await prisma.hackathonOrganizer.update({ where: { id: row.id }, data: { termsAcceptedAt } })
    else await prisma.hackathonJudge.update({ where: { id: row.id }, data: { termsAcceptedAt } })
    await recordAudit({ actorId: user.id, action: `hackathon.${role}.terms_accept`, entityType: role === 'organizer' ? 'HackathonOrganizer' : 'HackathonJudge', entityId: row.id, before: { termsAcceptedAt: null }, after: { termsAcceptedAt } })
    revalidatePath(role === 'organizer' ? '/manage' : '/judge', 'layout')
    return null
  },
)
