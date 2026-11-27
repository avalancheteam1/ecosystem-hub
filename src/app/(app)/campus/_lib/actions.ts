'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { CAMPUS_ORG_TYPES, cleanAliases, normalizeOrgName } from '@/lib/campus'
import { prisma } from '@/lib/db'
import { mergeOrgSchema, orgAliasesSchema, orgFlagSchema, renameOrgSchema } from './schemas'

const select = { id: true, type: true, name: true, aliases: true, country: true, parentId: true, rorId: true, verified: true, hidden: true } as const
const campusType = { in: [...CAMPUS_ORG_TYPES] }

async function findOrg(id: string) {
  const org = await prisma.organization.findUnique({ where: { id, type: campusType }, select })
  if (!org) throw new ActionError('Organization not found')
  return org
}

export const setOrgVerified = action({ schema: orgFlagSchema, permission: 'campus.manage' }, async ({ id, value }, user) => {
  const before = await findOrg(id)
  await prisma.organization.update({ where: { id, type: campusType }, data: { verified: value } })
  await recordAudit({ actorId: user.id, action: 'organization.verify', entityType: 'Organization', entityId: id, before: { verified: before.verified }, after: { verified: value } })
  revalidatePath('/admin/campus', 'layout')
  return null
})

export const setOrgHidden = action({ schema: orgFlagSchema, permission: 'campus.manage' }, async ({ id, value }, user) => {
  const before = await findOrg(id)
  await prisma.organization.update({ where: { id, type: campusType }, data: { hidden: value } })
  await recordAudit({ actorId: user.id, action: 'organization.hide', entityType: 'Organization', entityId: id, before: { hidden: before.hidden }, after: { hidden: value } })
  revalidatePath('/admin/campus', 'layout')
  return null
})

export const renameOrg = action({ schema: renameOrgSchema, permission: 'campus.manage' }, async ({ id, name }, user) => {
  const before = await findOrg(id)
  await prisma.organization.update({ where: { id, type: campusType }, data: { name, normalizedName: normalizeOrgName(name) } })
  await recordAudit({ actorId: user.id, action: 'organization.rename', entityType: 'Organization', entityId: id, before: { name: before.name }, after: { name } })
  revalidatePath('/admin/campus', 'layout')
  return null
})

export const setOrgAliases = action({ schema: orgAliasesSchema, permission: 'campus.manage' }, async ({ id, aliases }, user) => {
  const before = await findOrg(id)
  const data = cleanAliases(before.name, aliases)
  await prisma.organization.update({ where: { id, type: campusType }, data })
  await recordAudit({ actorId: user.id, action: 'organization.aliases', entityType: 'Organization', entityId: id, before: { aliases: before.aliases }, after: { aliases: data.aliases } })
  revalidatePath('/admin/campus', 'layout')
  return null
})

/** Moves members, club members and clubs of `source` to `target`, then deletes `source` (its names become `target`'s alternative names). */
export const mergeOrg = action({ schema: mergeOrgSchema, permission: 'campus.manage' }, async ({ sourceId, targetId }, user) => {
  const [source, target] = await Promise.all([findOrg(sourceId), findOrg(targetId)])
  if (source.type !== target.type) throw new ActionError('Only universities with universities, clubs with clubs')
  if (source.type === 'blockchain_club' && source.parentId !== target.parentId) throw new ActionError('Both clubs must belong to the same university')
  if (source.rorId && target.rorId) throw new ActionError('Both are different universities in the university list')
  const moved = await prisma.$transaction(async (tx) => {
    // Someone in both keeps their target membership; the rest move over.
    const inTarget = (await tx.universityMembership.findMany({ where: { universityId: targetId }, select: { userId: true } })).map((m) => m.userId)
    const members = await tx.universityMembership.updateMany({ where: { universityId: sourceId, userId: { notIn: inTarget } }, data: { universityId: targetId } })
    await tx.universityMembership.deleteMany({ where: { universityId: sourceId } })
    const clubMembers = await tx.universityMembership.updateMany({ where: { clubId: sourceId }, data: { clubId: targetId } })
    await tx.organization.updateMany({ where: { parentId: sourceId, type: 'blockchain_club' }, data: { parentId: targetId } })
    await tx.organization.delete({ where: { id: sourceId, type: campusType } })
    // Whoever searches for the old name still finds it.
    await tx.organization.update({ where: { id: targetId, type: campusType }, data: cleanAliases(target.name, [...target.aliases, source.name, ...source.aliases]) })
    // The catalog link moves along, or the picker would offer the source's university as new again.
    if (source.rorId) await tx.organization.update({ where: { id: targetId, type: campusType }, data: { rorId: source.rorId, verified: true } })
    return members.count + clubMembers.count
  })
  await recordAudit({ actorId: user.id, action: 'organization.merge', entityType: 'Organization', entityId: targetId, before: { merged: source }, after: { into: targetId, movedMembers: moved } })
  revalidatePath('/admin/campus', 'layout')
  return { moved }
})
