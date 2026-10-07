import type { Metadata } from 'next'
import { BookOpen, FolderGit2, Trophy } from 'lucide-react'
import { initials } from '@/components/layout/user-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { requireUser } from '@/lib/guards'
import { ProfileForm } from './_components/profile-form'

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } }

// What will fill the dashboard as areas ship. Replace an entry with real data when its area lands.
const UPCOMING = [
  { icon: Trophy, title: 'Hackathons you joined', body: 'Your teams, submissions and results.' },
  { icon: BookOpen, title: 'Courses in progress', body: 'Pick up where you left off.' },
  { icon: FolderGit2, title: 'Your projects', body: 'Ready to reuse for grant and hackathon applications.' },
]

export default async function DashboardPage() {
  const user = await requireUser()
  return (
    <div className="space-y-10">
      <header className="flex items-center gap-5">
        <Avatar className="size-16 border border-line">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback className="bg-surface-hover text-lg">{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate text-3xl sm:text-4xl">Hi, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 truncate text-fg-muted">{user.email}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface-2 p-6 lg:col-span-2">
          <h2 className="text-lg">Your activity</h2>
          <p className="mt-1 text-sm text-fg-muted">Nothing here yet — these fill up as the hub opens.</p>
          <ul className="mt-6 divide-y divide-line">
            {UPCOMING.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface-1">
                  <Icon className="size-5 text-brand" aria-hidden />
                </span>
                <div>
                  <h3 className="text-base">{title}</h3>
                  <p className="text-sm text-fg-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-line bg-surface-2 p-6">
          <h2 className="text-lg">Profile</h2>
          <p className="mt-1 mb-6 text-sm text-fg-muted">This is how other builders and organisers see you.</p>
          <ProfileForm name={user.name} />
        </section>
      </div>
    </div>
  )
}
