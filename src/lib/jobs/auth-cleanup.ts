import { prisma } from '@/lib/db'
import type { Job } from './index'

/** Daily: drop expired sessions and spent/expired verification codes. */
export const authCleanupJob: Job = {
  name: 'auth-cleanup',
  cron: '0 3 * * *',
  async run() {
    const now = new Date()
    const [sessions, verifications] = await Promise.all([
      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    ])
    return { sessionsDeleted: sessions.count, verificationsDeleted: verifications.count }
  },
}
