import 'server-only'
import { getAuthenticatorName } from '@better-auth/passkey'
import { prisma } from '@/lib/db'

/** Second factors of a user for the security page (never the secret or backup codes). */
export async function getSecuritySettings(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { twoFactorEnabled: true, passkeys: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, aaguid: true, createdAt: true } } },
  })
  return {
    totp: u.twoFactorEnabled,
    passkeys: u.passkeys.map((p) => ({ id: p.id, label: p.name || getAuthenticatorName(p.aaguid) || 'Passkey', createdAt: p.createdAt })),
  }
}
