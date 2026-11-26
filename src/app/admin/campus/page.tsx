import type { Prisma } from '@prisma/client'
import type { Metadata } from 'next'
import Link from 'next/link'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { StatusPill } from '@/components/status-pill'
import { TRACK_INTERESTS, UNIVERSITY_KINDS } from '@/lib/campus'
import { countryName } from '@/lib/countries'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/guards'
import { pageParam, textParam } from '@/lib/params'
import { FilterChip } from '@/components/filter-chip'

export const metadata: Metadata = { title: 'Students' }

const PAGE_SIZE = 50
const kindLabel = (k: string) => UNIVERSITY_KINDS.find((x) => x.id === k)?.label ?? k
const trackLabel = (t: string) => TRACK_INTERESTS.find((x) => x.id === t)?.label ?? t

type SP = { q?: string | string[]; page?: string | string[]; kind?: string | string[]; university?: string | string[]; coordinator?: string | string[] }

export default async function CampusStudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('campus.view')
  const sp = await searchParams
  const q = textParam(sp.q)
  const page = pageParam(sp.page)
  const kind = UNIVERSITY_KINDS.find((k) => k.id === textParam(sp.kind))?.id
  const university = textParam(sp.university, 40)
  const coordinator = textParam(sp.coordinator) === '1'
  const where: Prisma.UniversityMembershipWhereInput = {
    ...(kind ? { kind } : {}),
    ...(university ? { universityId: university } : {}),
    ...(coordinator ? { user: { campusProfile: { is: { campusCoordinatorInterest: true } } } } : {}),
    ...(q ? { OR: [{ user: { name: { contains: q, mode: 'insensitive' } } }, { user: { email: { contains: q, mode: 'insensitive' } } }, { university: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
  }
  const [rows, uni] = await Promise.all([
    prisma.universityMembership.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: {
        userId: true, universityId: true, kind: true, fieldOfStudy: true, graduationYear: true, clubPosition: true, createdAt: true,
        university: { select: { name: true, country: true } },
        club: { select: { name: true } },
        user: { select: { name: true, email: true, country: true, telegramAccount: true, campusProfile: { select: { trackInterests: true, campusCoordinatorInterest: true } } } },
      },
    }),
    university ? prisma.organization.findUnique({ where: { id: university, type: 'university' }, select: { name: true } }) : null,
  ])
  const list = rows.slice(0, PAGE_SIZE)
  const params = { q, kind, university, coordinator: coordinator ? '1' : undefined }
  const href = (patch: Partial<typeof params>) => {
    const qs = new URLSearchParams(Object.entries({ ...params, ...patch }).filter((e): e is [string, string] => !!e[1]))
    return `/admin/campus${qs.size ? `?${qs}` : ''}`
  }

  return (
    <>
      <PageHeader title="Students" description="Everyone with a university in their profile - students, faculty and staff. One row per university." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchForm q={q} placeholder="Search name, email or university" keep={Object.fromEntries(Object.entries({ kind, university, coordinator: params.coordinator }).filter((e): e is [string, string] => !!e[1]))} className="mb-0 flex-1 basis-56" />
        <div className="flex flex-wrap gap-2">
          <FilterChip href={href({ kind: undefined })} active={!kind}>All</FilterChip>
          {UNIVERSITY_KINDS.map((k) => <FilterChip key={k.id} href={href({ kind: k.id })} active={kind === k.id}>{k.label}</FilterChip>)}
          <FilterChip href={href({ coordinator: coordinator ? undefined : '1' })} active={coordinator}>Coordinator interest</FilterChip>
          {university && <FilterChip href={href({ university: undefined })} active>{uni?.name ?? 'University'} ×</FilterChip>}
        </div>
      </div>
      <DataTable
        id="admin-campus-students"
        empty="Nobody yet."
        columns={[
          { key: 'name', label: 'Name', hideable: false },
          { key: 'email', label: 'Email' },
          { key: 'telegram', label: 'Telegram' },
          { key: 'university', label: 'University' },
          { key: 'kind', label: 'Role' },
          { key: 'field', label: 'Field of study' },
          { key: 'grad', label: 'Graduation' },
          { key: 'club', label: 'Club' },
          { key: 'tracks', label: 'Tracks', defaultHidden: true },
          { key: 'coordinator', label: 'Coordinator' },
          { key: 'country', label: 'Country', defaultHidden: true },
          { key: 'joined', label: 'Added', className: 'whitespace-nowrap' },
        ]}
        rows={list.map((m) => ({
          id: `${m.userId}:${m.universityId}`,
          cells: {
            name: <span className="text-fg-heading">{m.user.name}</span>,
            email: m.user.email,
            telegram: m.user.telegramAccount ? `@${m.user.telegramAccount}` : '',
            university: <Link href={href({ university: m.universityId })} className="hover:underline">{m.university.name}</Link>,
            kind: kindLabel(m.kind),
            field: m.fieldOfStudy ?? '',
            grad: m.graduationYear ?? '',
            club: m.club ? `${m.club.name}${m.clubPosition ? ` · ${m.clubPosition}` : ''}` : '',
            tracks: m.user.campusProfile?.trackInterests.map(trackLabel).join(', ') ?? '',
            coordinator: m.user.campusProfile?.campusCoordinatorInterest ? <StatusPill tone="info">interested</StatusPill> : '',
            country: countryName(m.user.country) ?? '',
            joined: m.createdAt.toISOString().slice(0, 10),
          },
        }))}
      />
      <Pager page={page} hasMore={rows.length > PAGE_SIZE} params={params} />
    </>
  )
}
