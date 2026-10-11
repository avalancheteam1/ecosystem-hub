import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/guards'
import { byActivity } from '@/app/(app)/dashboard/_lib/highlights'
import { PendingInvites } from './_components/pending-invites'
import { ProjectGrid } from './_components/project-card'
import { listMyInvites, listMyProjects } from './_lib/queries'

export const metadata: Metadata = { title: 'Your projects', robots: { index: false } }

export default async function ProjectsPage() {
  const user = await requireUser()
  const [all, invites] = await Promise.all([listMyProjects(user.id), listMyInvites(user.id)])
  const projects = all.filter((p) => p.currentVersion).sort((a, b) => byActivity(a.currentVersion!, b.currentVersion!))
  const now = new Date()
  return (
    <>
      <PageHeader title="Your projects" description="Build once, keep improving, submit any version to hackathons and grants.">
        <Button asChild size="sm" className="h-10"><Link href="/projects/new"><Plus aria-hidden /> New project</Link></Button>
      </PageHeader>
      {invites.length > 0 && <div className="mb-8"><PendingInvites invites={invites} /></div>}
      <ProjectGrid projects={projects} now={now} />
    </>
  )
}
