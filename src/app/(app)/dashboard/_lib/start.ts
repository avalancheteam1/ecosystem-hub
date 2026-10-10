import { BUILDER_HUB_URL } from '@/lib/builder-hub'
import type { BuilderRole } from '@/lib/profile'

// "Start here" for builders who haven't joined or created anything yet, picked by
// the roles they chose on their profile. Ordered: the first matches win. Pure.
export type StartStep = { id: string; title: string; body: string; href: string; external?: boolean; for: readonly BuilderRole[] | 'all' }

const STEPS: StartStep[] = [
  { id: 'events', title: 'Find an event near you', body: 'Hackathons, workshops and meetups from team1 chapters.', href: '/events', for: 'all' },
  { id: 'project', title: 'Add your first project', body: 'Describe it once - reuse it for hackathons and grant applications.', href: '/projects/new', for: ['developer', 'founder', 'university'] },
  { id: 'learn', title: 'Learn Avalanche', body: 'Free Academy courses, from blockchain basics to your own L1.', href: `${BUILDER_HUB_URL}/academy`, external: true, for: ['developer', 'university', 'enthusiast'] },
  { id: 'grants', title: 'Explore grants', body: 'Funding programs for teams building on Avalanche.', href: `${BUILDER_HUB_URL}/grants`, external: true, for: ['founder', 'employee'] },
  { id: 'team1', title: 'Meet team1', body: 'The people and chapters behind the hub - and how to get involved.', href: 'https://team1.network', external: true, for: ['founder', 'employee', 'enthusiast'] },
  { id: 'invite', title: 'Bring your people', body: 'Share your invite link with friends, classmates and colleagues.', href: '/referrals', for: 'all' },
]

export function startSteps(roles: readonly string[], max = 4): StartStep[] {
  return STEPS.filter((s) => s.for === 'all' || s.for.some((r) => roles.includes(r))).slice(0, max)
}
