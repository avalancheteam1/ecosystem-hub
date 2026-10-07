import type { Prisma } from '@prisma/client'

/** Case-insensitive name/email search shared by the admin user lists. */
export function userSearchWhere(term: string | undefined): Prisma.UserWhereInput {
  if (!term) return {}
  return { OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] }
}
