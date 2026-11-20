import { formatEventRange } from '@/lib/dates'
import { registrationWindowState } from '../../_lib/hackathons/presentation'

/** The event window is separate from a builder's registration/approval status. */
export function RegistrationWindow({ hackathon, now }: { hackathon: { registrationOpensAt: Date | null; registrationClosesAt: Date | null; timezone: string }; now: Date }) {
  const state = registrationWindowState(hackathon, now)
  return <div className="space-y-2 text-sm">
    <p className="text-fg-heading">Registration window: {state === 'upcoming' ? 'Upcoming' : state === 'open' ? 'Open' : 'Closed'}</p>
    <p>Registration opens: {hackathon.registrationOpensAt ? formatEventRange(hackathon.registrationOpensAt, null, hackathon.timezone) : 'No opening date set'}</p>
    <p>Registration closes: {hackathon.registrationClosesAt ? formatEventRange(hackathon.registrationClosesAt, null, hackathon.timezone) : 'No closing date set'}</p>
  </div>
}
