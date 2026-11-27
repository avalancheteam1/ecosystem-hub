import 'server-only'
import type { OverviewSource } from '@/app/admin/_lib/overview'
import { CAMPUS_ORG_TYPES } from '@/lib/campus'
import { prisma } from '@/lib/db'
import { can } from '@/lib/permissions'

export const campusOverview: OverviewSource[] = [
  {
    group: 'Campus',
    show: (u) => can(u, 'campus.view'),
    load: async () => {
      const [students, coordinators] = await Promise.all([
        prisma.user.count({ where: { universityMemberships: { some: { kind: 'student' } } } }),
        prisma.campusProfile.count({ where: { campusCoordinatorInterest: true } }),
      ])
      return {
        stats: [
          { label: 'Students', value: students, href: '/admin/campus?kind=student' },
          { label: 'Want to be campus coordinator', value: coordinators, href: '/admin/campus?coordinator=1' },
        ],
      }
    },
  },
  {
    group: 'Campus',
    show: (u) => can(u, 'campus.manage'),
    load: async () => {
      const [review, universities] = await Promise.all([
        prisma.organization.count({ where: { type: { in: [...CAMPUS_ORG_TYPES] }, verified: false, hidden: false } }),
        prisma.organization.count({ where: { type: 'university', hidden: false, OR: [{ members: { some: {} } }, { clubMembers: { some: {} } }] } }),
      ])
      return {
        stats: [{ label: 'Universities with members', value: universities }],
        todos: [{ label: 'Universities and clubs to check', count: review, href: '/admin/campus/organizations?view=review' }],
      }
    },
  },
]
