import { submissionStatusLabel, registrationStatusLabel } from './presentation'

// Pure export formatting shared by both organizer CSV downloads.
export function csv(rows: readonly (readonly unknown[])[]): string {
  return '\uFEFF' + rows.map((row) => row.map((value) => {
    const s = value == null ? '' : String(value)
    const text = /^\s*[=+\-@]|^[\t\r\n]/.test(s) ? `'${s}` : s
    return `"${text.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
}

type ExportConfig = {
  tracks: { id: string; name: string }[]
  sponsorPrizes: { id: string; sponsor: string; name: string }[]
  stages: { name: string; scaleMin: number; scaleMax: number }[]
}
type ExportSubmission = {
  name: string | null | undefined; status: string; trackIds: string[]; sponsorPrizeIds: string[]
  team: { name: string; email: string }[]; stages: unknown[][]; awards: string
}

export function submissionExportRows(h: ExportConfig, submissions: ExportSubmission[]): unknown[][] {
  const header = ['Project', 'Status', 'Tracks', 'Sponsor prizes', 'Team', 'Emails', ...h.stages.flatMap((s) => [`${s.name} version`, `${s.name} score (0-100)`, `${s.name} rank`, `${s.name} advanced`, `${s.name} scale minimum`, `${s.name} scale maximum`]), 'Awards']
  return [header, ...submissions.map((sub) => [
    sub.name, submissionStatusLabel(sub.status),
    sub.trackIds.map((id) => h.tracks.find((t) => t.id === id)?.name).filter(Boolean).join('; '),
    sub.sponsorPrizeIds.flatMap((id) => { const p = h.sponsorPrizes.find((p) => p.id === id); return p ? [`${p.sponsor}: ${p.name}`] : [] }).join('; '),
    sub.team.map((m) => m.name).join('; '), sub.team.map((m) => m.email).join('; '),
    ...h.stages.flatMap((s, i) => [...sub.stages[i]!, s.scaleMin, s.scaleMax]), sub.awards,
  ])]
}

export function notSubmittedExportRows(drafts: { name: string; team: string[] }[], registrations: { status: string; user: { name: string; email: string } }[]): unknown[][] {
  return [
    ['Record type', 'Project', 'Team / participant', 'Registration status', 'Email'],
    ...drafts.map((d) => ['Saved project, never submitted', d.name, d.team.join('; '), '', '']),
    ...registrations.map((r) => ['Participant, no active submission', '', r.user.name, registrationStatusLabel(r.status), r.user.email]),
  ]
}
