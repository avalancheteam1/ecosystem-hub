import { formatEventRange } from '@/lib/dates'

export function submissionStatusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Submitted'
    case 'withdrawn': return 'Withdrawn'
    case 'disqualified': return 'Disqualified'
    default: return 'Unknown status'
  }
}

export function registrationStatusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Registered'
    case 'pending': return 'Awaiting approval'
    case 'rejected': return 'Rejected'
    case 'withdrawn': return 'Withdrawn'
    default: return 'Unknown status'
  }
}

export function registrationWindowState(h: { registrationOpensAt: Date | null; registrationClosesAt: Date | null }, now: Date): 'upcoming' | 'open' | 'closed' {
  if (h.registrationOpensAt && now < h.registrationOpensAt) return 'upcoming'
  return h.registrationClosesAt && now >= h.registrationClosesAt ? 'closed' : 'open'
}

export function submissionWindowText(stage: { opensAt: Date; closesAt: Date }, timeZone: string): string {
  return `Submissions open: ${formatEventRange(stage.opensAt, null, timeZone)}. Submissions close: ${formatEventRange(stage.closesAt, null, timeZone)}.`
}

export function judgingWindowText(stage: { closesAt: Date; judgingClosedAt: Date | null }, timeZone: string): string {
  return `Judging opens: ${formatEventRange(stage.closesAt, null, timeZone)}. ${stage.judgingClosedAt ? `Judging closed: ${formatEventRange(stage.judgingClosedAt, null, timeZone)}.` : 'Closes when the organizer ends judging.'}`
}

export function publicationText(publishedAt: Date | null, timeZone: string): string {
  return publishedAt ? `Published: ${formatEventRange(publishedAt, null, timeZone)}` : 'Announcement date not scheduled'
}
