import 'server-only'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { sendMail } from '@/lib/mailer'

type NoticeCopy = { subject: string; text: string; html?: string }
type ResultNoticeCopy = { winner: NoticeCopy; other: NoticeCopy }
type Recipient = { to: string; winner: boolean }

export function approvedNoticeCopy(): ResultNoticeCopy | null {
  // Enable delivery only after team1 supplies the approved result notices.
  return null
}

export async function snapshotResultNotices(tx: Prisma.TransactionClient, stageId: string) {
  const entries = await tx.earnSubmission.findMany({
    where: { stageId, status: { not: 'withdrawn' } },
    select: { contributorId: true, status: true, contributor: { select: { email: true } } },
  })
  const recipients = new Map<string, Recipient>()
  for (const entry of entries) {
    const winner = entry.status === 'approved'
    if (winner || !recipients.has(entry.contributorId)) {
      recipients.set(entry.contributorId, { to: entry.contributor.email, winner })
    }
  }
  return [...recipients.values()]
}

export async function sendResultNotices(bountyId: string, recipients: Recipient[], copy: ResultNoticeCopy) {
  for (const { to, winner } of recipients) {
    try {
      await sendMail({ ...(winner ? copy.winner : copy.other), to })
    } catch {
      // Transport errors may include addresses or message contents.
      logger.warn({ bountyId }, '[earn] result notice failed')
    }
  }
}
